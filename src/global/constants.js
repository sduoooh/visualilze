export const chooseFileServerPath = "http://127.0.0.1:8000/vsi/api/chooseFile"

export const wsUrl = 'ws://127.0.0.1:8000/vsi/api/ws'

export const inputGroupConstants = {
    configImport: {
        title: "配置",
        label: {
            configImport: "配置导入: ",
            configExport: "配置导出: ",
        }
    },
    baseConfig: {
        title : "基础设置",
        label: {
            modelImport: "模型导入： ",
            sourcesList: "震源位置",
            width: '模型长: ',
            height: '模型宽: ', 
            depth: '模型高: ',
            isVShader: '是否渲染速度模型: ',
            vAreaList: '岩层区域速度范围',
        }
    },
    arguments: {
        title: "参数: ",
        label: {
            timesizeperpacket: '数据批次大小: ',

            dx: '空间步长',
            timestep: '时间步长: ',
            totaltimesteps: '正演模拟步数: ',
        
            wavefrequency: '子波频率: ',
            thickness: '边界层厚: ',
        }
    }
}

// 为http://localhost:5173注册
//export const FSOToken = 'Aj8wbFhDTph5oHkGOmj6Si7BpsagLgYgm0Y+qUc3N9oPHkXmFoOPMGh5p6w/AML1TTSflO93pDkxBZ1AMMRNbgQAAABVeyJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0OjUxNzMiLCJmZWF0dXJlIjoiRmlsZVN5c3RlbU9ic2VydmVyIiwiZXhwaXJ5IjoxNzQ3MTgwNzk5fQ=='