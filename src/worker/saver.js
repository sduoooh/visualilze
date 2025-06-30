import { wsUrl } from '../global/constants'

let isWsReady = false; 
let ws, currentMaxFileBlockNum = -1;
const messageQueue = [];
let size;

const ConnectStatus = {
    Pre: 0,
    V: 1,
    Communition: 2,
}
let connectStatus = ConnectStatus.Pre;

onmessage = async (e) => {
    if (!isWsReady)
        initWebSocket()
    const { type, params } = e.data;
    currentMaxFileBlockNum = -1;
    switch(type) {
        case 'PARAM_UPDATE':
            if (!isWsReady) {
                messageQueue.push({ type: 'paramUpdate', data: params });
            } else {
                await reCreate();
                ws.send(JSON.stringify({ type: 'paramUpdate', data: params }));
            }
            break;
        case 'STOP':
            connectStatus = ConnectStatus.Pre;
            ws.send(JSON.stringify({ type: 'stop' }));
            await deleteAll();
            break;
    }
}

const opfsRoot = await navigator.storage.getDirectory();

try {
  await opfsRoot.removeEntry('visualize_opfs', { recursive: true });
} catch (_) {}

let foldHandle = await opfsRoot.getDirectoryHandle('visualize_opfs', {
  create: true
});

const deleteAll = async () => {
    await opfsRoot.removeEntry('visualize_opfs', { recursive: true });
    foldHandle = null;
}
const reCreate = async () => foldHandle = await opfsRoot.getDirectoryHandle('visualize_opfs', {
    create: true
});

function initWebSocket () {
    try {
        ws = new WebSocket(wsUrl);
    } catch {
        deleteAll();    
        postMessage({
            type: "break",
            data: `与后端url${wsUrl}建立ws连接失败`,
        })
        return
    }

    ws.onopen = () => {
        isWsReady = true;
        while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            ws.send(JSON.stringify(msg));
        }
    };

    ws.onclose = () => {
        deleteAll();
        postMessage({
            type: "break",
            data: `与后端建立的ws连接断开`,
        })
    }
    
    ws.onmessage = async (event) => {
        if (connectStatus === ConnectStatus.Pre){
            try {
                let size_pure = JSON.parse(event.data)
                if (size_pure.success) {
                    size = size_pure.size
                } else {
                    postMessage({
                        type: "break",
                        data: size_pure.data,
                    })
                }
                connectStatus = ConnectStatus.V;
            } catch(e) {
                console.log(e)
            }
        }else if (connectStatus === ConnectStatus.V){
            try {
                let size_pure = JSON.parse(event.data)
                if (!size_pure.success) {
                    postMessage({
                        type: "break",
                        data: size_pure.data,
                    })
                    return
                }
            }catch(_) {
                const data = new Float32Array(await event.data.arrayBuffer())
                const dataFileHandle = await foldHandle.getFileHandle("v",{
                    create: true,
                });
                const dataAccessHandle = await dataFileHandle.createSyncAccessHandle();
                dataAccessHandle.write(data)
                dataAccessHandle.close();
                connectStatus = ConnectStatus.Communition;
                postMessage({
                    type: "size",
                    size: size,
                })
            }
        }else {
            try {
                let size_pure = JSON.parse(event.data)
                if (!size_pure.success) {
                    postMessage({
                        type: "break",
                        data: size_pure.data,
                    })
                    return
                }
            }catch(_) {
                currentMaxFileBlockNum ++;
                const data = new Float32Array(await event.data.arrayBuffer())
                const dataFileHandle = await foldHandle.getFileHandle(currentMaxFileBlockNum + "",{
                    create: true,
                });
                const dataAccessHandle = await dataFileHandle.createSyncAccessHandle();
                dataAccessHandle.write(data)
                dataAccessHandle.close();
                postMessage({
                    type: "update",
                    data: currentMaxFileBlockNum,
                })
            }
        }
    };
}