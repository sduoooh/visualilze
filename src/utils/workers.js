import { ref } from "vue"

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

export class Workers{
    
    commandSize = Int32Array.BYTES_PER_ELEMENT * 8;
    loadChannel;
    once = false;
    currentMaxFileBlockNum = ref(-1);
    currentFileIndex = ref(-1);
    status = ref(0); // 0为未init， 1为正在init， 2为init完成, 3 为暂停后的等待
    break = false;

    max_press = ref(0);
    min_press = ref(0);
    transMode = ref(false);
    base = ref(1);

    init(canvas, args, w, h){
        this.status.value = 1

        this.sab = new SharedArrayBuffer(this.commandSize)
        this.loadChannelI = new Int32Array(this.sab);
        this.loadChannelF = new Float32Array(this.sab);

        this.loadWorker = new Worker(
            new URL('../worker/render.js?worker', import.meta.url), 
            {
                type: 'module',
            },
        );
        this.saveWorker = new Worker(
            new URL('../worker/saver.js?worker', import.meta.url), 
            {
                type: 'module',
            },
        );

        this.loadWorker.postMessage({
            type: "canvas", 
            canvas: canvas
        }, [canvas])

        this.loadWorker.onmessage = (e) => {
            if (e.data.type === 0) {
                this.currentFileIndex.value = e.data.data
            }else if(e.data.type === 1){
                this.max_press.value = e.data.data.max
                this.min_press.value = e.data.data.min
            }else if(e.data.type === 2){
                this.transMode.value = e.data.data
            }
        }
        this.saveWorker.onmessage = (e) => {
            var msg = e.data
            switch (msg.type){
                case "size":
                    this.base.value = msg.size[3];
                    Atomics.store(this.loadChannelI, 1, msg.size[4]);
                    Atomics.store(this.loadChannelI, 3, msg.size[0]);
                    Atomics.store(this.loadChannelI, 4, msg.size[1]);
                    Atomics.store(this.loadChannelI, 5, msg.size[2]);
                    Atomics.store(this.loadChannelI, 6, w);
                    Atomics.store(this.loadChannelI, 7, h);
                    Atomics.store(this.loadChannelI, 0, SabStatus.Init);
                    Atomics.notify(this.loadChannelI, 0);

                    if (!this.once) {
                        this.loadWorker.postMessage({
                            type: "sab",
                            sab: this.loadChannelI.buffer,
                            max_press: msg.size[3],
                        });
                        this.once = true;
                    }
                    this.status.value = 2;
                    break;
                case "update":
                    if (this.status.value != 2) return
                    this.currentMaxFileBlockNum.value = msg.data;
                    this.loadChannelI[1] = this.currentMaxFileBlockNum.value;
                    break;
                case "break":
                    alert("后端错误,错误信息： " + msg.data)
                    window.location.reload();
                    this.break = true;
                    break;
            }
        };
        this.ParamUpdate(args);
    }


    /**
     * @param {int} fileIndex 召回的数据索引
     * 
     */
    FileIndexUpdate(fileIndex) {
        if (this.break) {
            return
        }
        Atomics.store(this.loadChannelI, 2, fileIndex)
        Atomics.or(this.loadChannelI, 0, SabStatus.FileIndexUpdate)
        Atomics.notify(this.loadChannelI, 0)
    }

    /**
     * @param {float} dx 
     * @param {float} dy
     * 
     */


    CamPosUpdate(dx, dy) {
        if (this.break) {
            return
        }
        if (this.status.value != 2) {
            return
        }
        Atomics.add(this.loadChannelI, 4, dx)
        Atomics.add(this.loadChannelI, 5, dy)
        Atomics.or(this.loadChannelI, 0, SabStatus.CamPosUpdate)
        Atomics.notify(this.loadChannelI, 0)
    }

    /**
     * @param {int} fov
     * 
     */
    FovUpdate(fov) {
        if (this.break) {
            return
        }
        if (this.status.value != 2) {
            return
        }
        Atomics.add(this.loadChannelI, 3, fov)

        Atomics.or(this.loadChannelI, 0, SabStatus.FovUpdate)
        Atomics.notify(this.loadChannelI, 0)
    }

    /**
     * @param {int} width
     * @param {int} height
     * 
     */
    AspectUpdate(w, h) {
        if (this.break) {
            return
        }
        if (this.status.value != 2) {
            return
        }
        Atomics.store(this.loadChannelI, 6, w)
        Atomics.store(this.loadChannelI, 7, h)
        Atomics.or(this.loadChannelI, 0, SabStatus.AspectUpdate)
        Atomics.notify(this.loadChannelI, 0)
    }

    ChangeTransMode() {
        if (this.break) {
            return
        }
        if (this.status.value != 2) {
            return
        }
        Atomics.or(this.loadChannelI, 0, SabStatus.ChangeTransMode)
        Atomics.notify(this.loadChannelI, 0)
    }

    ParamUpdate(params) {
        if (this.break) {
            alert("后端连接断开")
            window.location.reload();
            return
        }
        this.status.value = 1;
        console.log(params)
        this.saveWorker.postMessage({
            type: 'PARAM_UPDATE',
            params: params,
        });
        this.currentMaxFileBlockNum.value = -1;
        this.currentFileIndex.value = -1;
        this.max_press.value = 0;
    }

    Stop() {
        if (this.break) {
            alert("后端连接断开")
            window.location.reload();
            return
        }
        this.status.value = 3;
        this.saveWorker.postMessage({
            type: 'STOP',
            params: undefined,
        })
        this.currentMaxFileBlockNum.value = -1;
        this.currentFileIndex.value = -1;
        this.max_press.value = 0;
        Atomics.or(this.loadChannelI, 0, SabStatus.ReInit);
        Atomics.notify(this.loadChannelI, 0);
    }
}