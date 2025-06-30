import { CameraState } from '../utils/CameraState';

import { volumeShaderCode, axisShaderCode } from '../global/shader';

let gpuDevice, gpuContext, renderBundle, axisBundle, target, volumeTexture, vCamMat, pipeline, bindGroup;
let stagingBufferVList, stagingIndex, cacheIndex, stagingBufferKList, lastTime, tempArray;
let maxList, minList;
let transMode;
let vertexBuffer, indexBuffer, maxBuffer, minBuffer, baseBuffer, vBuffer;
let width, height, depth, thickness, max_press, canvas;
let cacheNum = 5, unitByte;
let filterable = false;

let axisV, axisI;
let axisPipeline, axisBindGroup;

let frameTime = 160, frameNum = 6, _timeout = frameTime * frameNum, almostTimeout = 0.9 * _timeout, timeout = _timeout;

let texUpdateFlag;

let foldHandle;

let sabI;

let cam;

const SabStatus = {
    None: 0,
    FileIndexUpdate: 1,
    CamPosUpdate: 2,
    FovUpdate: 4,
    AspectUpdate: 8,
    ChangeTransMode: 16,
    Init: 32,
    Rendring: 64,
    SelfAdd: 128,
    ReInit: 256,
}

// sab:
// 0        status I          :  0 | 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256  => none | update fileIndex | update camPos | update fov | update aspect | change trans mode | init | rendering | fileIndex self added | reInit
// 1 currentMaxFileBlockNum I
// 2     fileNumNeeded I 
// 3   fovChange I  |  width I  
// 4   mouseX F  |  height I 
// 5   mouseY F  |  depth I
// 6  canvasWidth I | max_press I
// 7     canvasHeight I

onmessage = async (e) => {
    if (e.data.type === "canvas") {
        canvas = e.data.canvas
        gpuContext = e.data.canvas.getContext("webgpu");
        return
    }

    
    sabI = new Int32Array(e.data.sab);
    max_press = e.data.max_press;

    const mousePositionSource = new BigInt64Array(sabI.buffer);
    const tempBigInt = new BigInt64Array(1);
    const valueMousePosition = new Int32Array(tempBigInt.buffer);
    while (true) {
        Atomics.wait(sabI, 0, SabStatus.None);  //必须要init
        await init();
        
        while (true){
            Atomics.wait(sabI, 0, SabStatus.None, timeout);
            let sabStatus = Atomics.exchange(sabI, 0, SabStatus.Rendring);
            Atomics.notify(sabI, 0);
            const now = Date.now();
            
            if (sabStatus & SabStatus.Rendring){
                sabStatus -= SabStatus.Rendring;
                Atomics.or(sabI, 0, sabStatus);    
                Atomics.notify(sabI, 0);
                continue;
            }

            if (sabStatus & SabStatus.ReInit) {
                await clean();
                break;
            }

            texUpdateFlag = true;
            if (sabStatus & SabStatus.FileIndexUpdate) {
                if (lastTime) {
                    lastTime = null;
                }
                if (await updateIndexRandom(sabI[2])) {
                    texUpdateFlag = false;
                }
            }else if(lastTime){
                if (lastTime && (now - lastTime) >= almostTimeout) {
                    if (await updateIndexOrder()) {
                        texUpdateFlag = false;
                    }
                    timeout = _timeout
                    almostTimeout = 0.9 * _timeout
                }else {
                    texUpdateFlag = false;
                    timeout -= (now - lastTime)
                    almostTimeout = 0.9 * timeout
                }
            }

            if (sabStatus & SabStatus.CamPosUpdate) {  // 具有累加效应，使用exchange
                tempBigInt[0] = Atomics.exchange(mousePositionSource, 2, BigInt(0));
                cam.handleRotation(...valueMousePosition);
            }
            if (sabStatus & SabStatus.FovUpdate) cam.handleZoom(Atomics.exchange(sabI, 3, 0));
            if (sabStatus & SabStatus.AspectUpdate) cam.handleResize(Atomics.exchange(sabI, 6, 0), Atomics.exchange(sabI, 7, 0));

            let transModeChanged = false;
            if (sabStatus & SabStatus.ChangeTransMode) {
                transMode = !transMode;
                updateMetaBuffer();
                transModeChanged = true;
                postMessage({ type: 2, data: transMode });
            };

            if (sabStatus & SabStatus.Init) await init();

            if (maxList.length === 0) {
                
                console.log(`bug: 不缓存即准备rendering.`)

            }else {
                if (texUpdateFlag || cam._updateFlag || transModeChanged) {
                    await gpuDevice.queue.onSubmittedWorkDone()
                    render()
                    await gpuDevice.queue.onSubmittedWorkDone()
                }
                if (texUpdateFlag) {
                    const index = stagingBufferKList[stagingIndex] * cacheNum + cacheIndex
                    postMessage({ type: 0, data: index })
                }
            }

            Atomics.and(sabI, 0, ~SabStatus.Rendring);
            Atomics.notify(sabI, 0);

            if (lastTime || Atomics.load(sabI, 1) * cacheNum + cacheNum - 1 === stagingBufferKList[stagingIndex] * cacheNum + cacheIndex) 
                lastTime = now
        }
    }
}

const opfsRoot = await navigator.storage.getDirectory();

const reCreate = async () => foldHandle = await opfsRoot.getDirectoryHandle('visualize_opfs');

const vertices = new Float32Array(24);

const indices = new Uint16Array([
    0, 1, 2, 2, 3, 0,   // 前
    1, 5, 6, 6, 2, 1,   // 右
    5, 4, 7, 7, 6, 5,   // 后
    4, 0, 3, 3, 7, 4,   // 左
    3, 2, 6, 6, 7, 3,   // 上
    4, 5, 1, 1, 0, 4,   // 下
]);

async function init () {
    console.log("render init start")

    stagingIndex = 0;
    cacheIndex = -1;
    stagingBufferKList = [-1, -1];
    maxList = [];
    minList = [];

    transMode = false;

    width = Atomics.exchange(sabI, 3, 0)
    height = Atomics.exchange(sabI, 4, 0)
    depth = Atomics.exchange(sabI, 5, 0)
    thickness = Atomics.exchange(sabI, 1, -1);

    tempArray = new Float32Array(new ArrayBuffer(5 * (2 + width * height * depth) * 4));
    lastTime = Date.now();

    const bytesPerRow = width * 4;
    unitByte = depth * height * bytesPerRow;

    vertices.set([
        -width/2, -height/2, depth/2,
         width/2, -height/2, depth/2,
         width/2,  height/2, depth/2,
        -width/2,  height/2, depth/2,

        -width/2, -height/2, -depth/2,
         width/2, -height/2, -depth/2,
         width/2,  height/2, -depth/2,
        -width/2,  height/2, -depth/2,
    ]);

    await reCreate();

    await initWebGPU();

    cam = new CameraState(Math.max(width - 2 * thickness, height - 2 * thickness, depth - 2 * thickness), Atomics.load(sabI, 6), Atomics.load(sabI, 7), gpuDevice, canvas, vCamMat)

    Atomics.store(sabI, 0, SabStatus.None);
    Atomics.notify(sabI, 0);

    console.log("render init complete")
}

async function initWebGPU() {  
    const adapter = await navigator.gpu.requestAdapter();
    if (!gpuDevice) 
        filterable = adapter.features.has('float32-filterable');
        console.log(`float32-filterable supported: ${filterable}`)
        gpuDevice = 
            filterable ? 
                await adapter?.requestDevice({
                    requiredFeatures: [ 'float32-filterable' ],
                }) :
                await adapter?.requestDevice();

    const canvasConfig = {
        device: gpuDevice,
        format: 'bgra8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        alphaMode: 'premultiplied',
    };
    gpuContext.configure(canvasConfig);
    target = gpuContext.getCurrentTexture();

    const commandEncoder = gpuDevice.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: target.createView(),
            clearValue: { r: 224 / 255, g: 241 / 255, b: 1, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
        }]
    });
    renderPass.end();
    gpuDevice.queue.submit([commandEncoder.finish()]);

    vertexBuffer = gpuDevice.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(vertices);
    vertexBuffer.unmap();

    indexBuffer = gpuDevice.createBuffer({
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
    });
    new Uint16Array(indexBuffer.getMappedRange()).set(indices);
    indexBuffer.unmap();

    stagingBufferVList = [
        gpuDevice.createBuffer({
            size: unitByte * cacheNum, 
            usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
            mappedAtCreation: true, 
        }),
        gpuDevice.createBuffer({
            size: unitByte * cacheNum, 
            usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
            mappedAtCreation: true,  
        }),
    ]

    volumeTexture = gpuDevice.createTexture({
        size: [width, height, depth], // torch.Tensor.reshape(-1) 将 depth 当成每行长度
        format: 'r32float',   
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        dimension: '3d'
    });

    vBuffer = gpuDevice.createTexture({
        size: [width, height, depth], 
        format: 'r32float',   
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        dimension: '3d',
    });
    const fileHandle = await foldHandle.getFileHandle("v");
    const syncAccessHandle = await fileHandle.createSyncAccessHandle();
    const temp = new Float32Array(new ArrayBuffer(syncAccessHandle.getSize()));
    syncAccessHandle.read(temp);
    syncAccessHandle.close();
    
    gpuDevice.queue.writeTexture(
        { texture: vBuffer },
        temp,
        { 
            bytesPerRow: width * 4,
            rowsPerImage: height
        },
        [width, height, depth]
    );
    
    maxBuffer = gpuDevice.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    minBuffer = gpuDevice.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    baseBuffer = gpuDevice.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    vCamMat = gpuDevice.createBuffer({
        size: 16 * 4 + 4 * 4, // vpMat + camPos
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const boxSize = gpuDevice.createBuffer({
        size: 3 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true, 
    });
    new Float32Array(boxSize.getMappedRange()).set([width, height, depth])
    boxSize.unmap()

    const thicknessBuffer = gpuDevice.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true, 
    });
    new Float32Array(thicknessBuffer.getMappedRange()).set([thickness])
    thicknessBuffer.unmap()

    const bindGroupLayout = gpuDevice.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: filterable ? {
                    viewDimension: '3d'
                } : {
                    sampleType: 'unfilterable-float', 
                    viewDimension: '3d'
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            },
            {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: filterable ? {} : { type: 'non-filtering' } 
            },
            {
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            },
            {
                binding: 5,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            },
            {
                binding: 6,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            },
            {
                binding: 7,
                visibility: GPUShaderStage.FRAGMENT,
                texture: filterable ? {
                    viewDimension: '3d'
                } : {
                    sampleType: 'unfilterable-float', 
                    viewDimension: '3d'
                }
            },
            {
                binding: 8,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            },
        ]
    });

    pipeline = gpuDevice.createRenderPipeline({
        layout: gpuDevice.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout] 
        }),
        vertex: {
            module: gpuDevice.createShaderModule({
                code: volumeShaderCode,
            }),
            entryPoint: 'v_main',
            buffers: [{
                arrayStride: 3 * 4, 
                attributes: [{
                    shaderLocation: 0,
                    offset: 0,
                    format: 'float32x3',
                }],
            }],
        },
        fragment: {
            module: gpuDevice.createShaderModule({
                code: volumeShaderCode,
            }),
            entryPoint: 'f_main',
            targets: [{
                format: 'bgra8unorm',
            }]
        },
        primitive: {
            topology: 'triangle-list',
            cullMode: 'back',
        },
    });
    
    bindGroup = gpuDevice.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: volumeTexture.createView(),
            },
            {
                binding: 1,
                resource: { buffer: vCamMat },
            },
            {
                binding: 2,
                resource: { buffer: boxSize },
            },
            {
                binding: 3,
                resource: gpuDevice.createSampler(filterable ? {
                        magFilter: 'linear', 
                        minFilter: 'linear',
                        mipmapFilter: 'linear',
                    } : {
                        magFilter: 'nearest', 
                        minFilter: 'nearest',
                        mipmapFilter: 'nearest',
                }),
            },
            {
                binding: 4,
                resource: { buffer: maxBuffer },
            },
            {
                binding: 5,
                resource: { buffer: minBuffer },
            },
            {
                binding: 6,
                resource: { buffer: baseBuffer },
            },
            {
                binding: 7,
                resource: vBuffer.createView(),
            },
            {
                binding: 8,
                resource: { buffer: thicknessBuffer },
            },
        ]
    });

    function renderRecord(renderPass) {
        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);
        renderPass.setVertexBuffer(0, vertexBuffer);
        renderPass.setIndexBuffer(indexBuffer, 'uint16');
        renderPass.drawIndexed(36); 
    }
    const renderBundleEncoder = gpuDevice.createRenderBundleEncoder({
        colorFormats: ['bgra8unorm'],
    });
    renderRecord(renderBundleEncoder);
    renderBundle = renderBundleEncoder.finish();


    axisV = gpuDevice.createBuffer({
        size: 4 * 4,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(axisV.getMappedRange()).set(new Float32Array([0, width * 0.75, height * 0.75, depth * 0.75]));
    axisV.unmap();

    axisI = gpuDevice.createBuffer({
        size: 2 * 3 * 2,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
    });
    new Uint16Array(axisI.getMappedRange()).set(new Uint16Array([0, 1, 0, 2, 0, 3]));
    axisI.unmap();  

    const axisBindGroupLayout = gpuDevice.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            },
        ]
    });

    axisPipeline = gpuDevice.createRenderPipeline({
        layout: gpuDevice.createPipelineLayout({
            bindGroupLayouts: [axisBindGroupLayout] 
        }),
        vertex: {
            module: gpuDevice.createShaderModule({
                code: axisShaderCode,
            }),
            entryPoint: 'v_main',
            buffers: [{
                arrayStride: 4, 
                attributes: [{
                    shaderLocation: 0,
                    offset: 0,
                    format: 'float32',
                }],
            }],
        },
        fragment: {
            module: gpuDevice.createShaderModule({
                code: axisShaderCode,
            }),
            entryPoint: 'f_main',
            targets: [{
                format: 'bgra8unorm',
            }]
        },
        primitive: {
            topology: 'line-list',
        },
    });
    
    axisBindGroup = gpuDevice.createBindGroup({
        layout: axisPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: { buffer: vCamMat },
            }
        ]
    });

    function axisRecord(renderPass) {
        renderPass.setPipeline(axisPipeline);
        renderPass.setBindGroup(0, axisBindGroup);
        renderPass.setVertexBuffer(0, axisV);
        renderPass.setIndexBuffer(axisI, 'uint16');
        renderPass.drawIndexed(6, 3); 
    }
    const axisRenderBundleEncoder = gpuDevice.createRenderBundleEncoder({
        colorFormats: ['bgra8unorm'],
    });
    axisRecord(axisRenderBundleEncoder);
    axisBundle = axisRenderBundleEncoder.finish();
}


async function clean () {
    const commandEncoder = gpuDevice.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: gpuContext.getCurrentTexture().createView(),
            clearValue: { r: 224 / 255, g: 241 / 255, b: 1, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
        }]
    });
    renderPass.end();
    gpuDevice.queue.submit([commandEncoder.finish()]);
    await gpuDevice.queue.onSubmittedWorkDone();
        
    volumeTexture?.destroy();
    stagingBufferVList?.forEach(buffer => buffer?.destroy());
    vertexBuffer?.destroy();
    indexBuffer?.destroy();
    maxBuffer?.destroy();
    minBuffer?.destroy();
    baseBuffer?.destroy();
    vBuffer?.destroy();
    vCamMat?.destroy();

    cam = null;

    almostTimeout = 0.9 * _timeout;
    timeout = _timeout;

    transMode = false;

    foldHandle = null;

    Atomics.store(sabI, 1, -1);
    Atomics.and(sabI, 0, SabStatus.Init);
    Atomics.notify(sabI, 0);
}

const updateMetaBuffer = () => {
    if (!transMode) {
        gpuDevice.queue.writeBuffer(maxBuffer, 0, new Float32Array([maxList[stagingIndex][cacheIndex]]));
        gpuDevice.queue.writeBuffer(minBuffer, 0, new Float32Array([minList[stagingIndex][cacheIndex]]));
    }else {
        gpuDevice.queue.writeBuffer(maxBuffer, 0, new Float32Array([max_press]));
        gpuDevice.queue.writeBuffer(minBuffer, 0, new Float32Array([-max_press]));
    }
    postMessage({ 
        type: 1, 
        data: {
            max: maxList[stagingIndex][cacheIndex],
            min: minList[stagingIndex][cacheIndex],
        }
    });
    gpuDevice.queue.writeBuffer(baseBuffer, 0, new Float32Array([maxList[stagingIndex][cacheIndex] - minList[stagingIndex][cacheIndex]]));
}


const updateStagingBuffer = async (fileBlockNum, stagingBufferIndex, isPredict = false) => {
    let stgIdx = stagingBufferIndex;
    if (stagingBufferVList[stgIdx].mapState != "mapped") {
        if (stagingBufferVList[1 - stgIdx].mapState === "mapped") 
            stgIdx = 1 - stgIdx;
        else await stagingBufferVList[stgIdx].mapAsync(GPUBufferUsage.MAP_WRITE)
    }
    if (!isPredict && stagingBufferVList[1 - stgIdx].mapState != "mapped") stagingBufferVList[1 - stgIdx].mapAsync(GPUBufferUsage.MAP_WRITE)

    const fileHandle = await foldHandle.getFileHandle(fileBlockNum + "");

    const syncAccessHandle = await fileHandle.createSyncAccessHandle();
    
    syncAccessHandle.read(tempArray);
    syncAccessHandle.close();
    new Float32Array(stagingBufferVList[stgIdx].getMappedRange()).set(tempArray.subarray(10));
    stagingBufferVList[stgIdx].unmap();

    stagingBufferKList[stgIdx] = fileBlockNum;
    maxList[stgIdx] = tempArray.slice(0, 5);
    minList[stgIdx] = tempArray.slice(5, 10);

    return stgIdx
}

const updateIndexRandom = async (fileIndex) => {
    let maxNum = Atomics.load(sabI, 1);

    let fileBlockNum = Math.floor(fileIndex / cacheNum);

    if (fileBlockNum > maxNum) return true
    if (stagingBufferKList.includes(fileBlockNum)) {
        stagingIndex = (stagingBufferKList[1] === fileBlockNum) * 1
    }else {
        stagingIndex = await updateStagingBuffer(fileBlockNum, 1 - stagingIndex)
    }
    cacheIndex = fileIndex % cacheNum
    if (stagingBufferVList[stagingIndex].mapState != "unmapped") stagingBufferVList[stagingIndex].unmap()
    updateMetaBuffer()
    return false
}

const updateIndexOrder = async () => {
    let maxNum = Atomics.load(sabI, 1)
    var fileIndex = !maxList.length ? 0 : stagingBufferKList[stagingIndex] * cacheNum + cacheIndex + 1;
    var fileBlockNum = Math.floor(fileIndex / cacheNum);
    var cacheIndex_ = fileIndex % cacheNum;

    if (fileBlockNum > maxNum) return true

    cacheIndex = cacheIndex_

    if (stagingBufferKList.includes(fileBlockNum)) {
        const last = stagingIndex;
        stagingIndex = (stagingBufferKList[1] === fileBlockNum) * 1
        // if (stagingIndex != last) stagingBufferVList[last].mapAsync(GPUBufferUsage.MAP_WRITE)

        // if ((cacheIndex === Math.floor(cacheNum / 2)) && (fileBlockNum + 1 <= maxNum) && !stagingBufferKList.includes(fileBlockNum + 1)) {
        //     console.log(`预缓存 ${fileBlockNum + 1}`)
        //     await updateStagingBuffer(fileBlockNum + 1, 1 - stagingIndex, true);
        // }
    }else {
        stagingIndex = await updateStagingBuffer(fileBlockNum, 1 - stagingIndex);
    }
    if (stagingBufferVList[stagingIndex].mapState != "unmapped") stagingBufferVList[stagingIndex].unmap()
    updateMetaBuffer()
    return false
}

function render() {

    cam.updateViewProjMatrix();

    target = gpuContext.getCurrentTexture();
    
    const commandEncoder = gpuDevice.createCommandEncoder();

    if (texUpdateFlag){
        commandEncoder.copyBufferToTexture(
            {
                buffer: stagingBufferVList[stagingIndex],
                offset: cacheIndex * unitByte,
                bytesPerRow: width * 4,
                rowsPerImage: height,
            },
            {
                texture: volumeTexture,
            },
            [width, height, depth], 
        );
    }

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: target.createView(),
            clearValue: { r: 224 / 255, g: 241 / 255, b: 1, a: 1.0 }, 
            loadOp: 'clear',
            storeOp: 'store',
        }]
    });

    renderPass.executeBundles([renderBundle,axisBundle]);
    renderPass.end();
    gpuDevice.queue.submit([commandEncoder.finish()]);
}