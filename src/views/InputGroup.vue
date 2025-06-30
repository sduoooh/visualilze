<script setup> 
// 1. update the arguments and path
// 2. 
//

import { ref } from 'vue';

import SameInputs from '../components/SameInputs.vue';
import WithLabel from '../components/WithLabel.vue';
import FilePathInput from '../components/FilePathInput.vue';

import { inputGroupConstants } from '../global/constants';
import { toRaw } from 'vue';

const emits = defineEmits(['update', 'stop'])

const open = ref(true)
const a_ref = ref(null)

const filepath = ref('')
const debugArgument = ref({
    timestep: 0,
    dx: 0, 
    totaltimesteps: 0,

    wavefrequency: 0,
    thickness: 0,
})
const modelArgument = ref({
    width: 0,  //width + 2 * thickness 必须是64的倍数
    height: 0,
    depth: 0, 

    sourcesList: [
        [0,0,0]
    ],

    isVShader: false,
    vAreaList: [
        [0, 0],
    ],
})

const lastedArgument = ref('')

const checkOverLimit = (value, limit) => value < 0 || value > limit

const checkSourceValid = () => {
    debugArgument.value.thickness = Math.abs(Math.trunc(debugArgument.value.thickness))
    modelArgument.value.width = Math.abs(Math.trunc(modelArgument.value.width))
    modelArgument.value.height = Math.abs(Math.trunc(modelArgument.value.height))
    modelArgument.value.depth = Math.abs(Math.trunc(modelArgument.value.depth))
    if (modelArgument.value.width * modelArgument.value.height * modelArgument.value.depth === 0) {
        alert("模型大小不能为0")
        return false
    }
    if ((modelArgument.value.width + 2 * debugArgument.value.thickness) % 64 !== 0) {
        alert("模型包含层厚的总长必须是64的倍数")
        return false
    }
    const limit = [modelArgument.value.width, modelArgument.value.height, modelArgument.value.depth]
    for (let souces in modelArgument.value.sourcesList){
        if (checkOverLimit(souces[0], limit[0]) || checkOverLimit(souces[1], limit[1] || checkOverLimit(souces[2], limit[2]))){
            alert("震源设置不能超过模型大小")
            return false
        }
    }
    return true
}

const stop = () => emits('stop')

const checkArgumentValid = () => {
    if (!modelArgument.value.isVShader) modelArgument.value.vAreaList.length = 0
    if (modelArgument.value.isVShader && !modelArgument.value.vAreaList.length) {
        alert("必须至少设置背景区域以进行速度模型渲染")
        return false
    }
    if (filepath.value === '') {
        alert('必须选择模型文件以进行正演');
        return false
    }
    if (modelArgument.value.sourcesList.length === 0) {
        alert("必须设置震源以开始正演")
        return false
    }
    if (!checkSourceValid()) {
        return false
    }
    if (debugArgument.value.totaltimesteps <= 0) {
        alert("时间步长必须大于0")
        return false
    }
    return true
}

const start = () => {
    if (!checkArgumentValid()) return
    console.log('start')
    emits('update', {argument: {...toRaw(debugArgument.value), ...toRaw(modelArgument.value)}, filepath: filepath.value})
    lastedArgument.value = JSON.stringify(debugArgument.value) + JSON.stringify(modelArgument.value) + filepath.value
}

const configExport = () => {
    if (!checkArgumentValid()) return
    const config = {
        argument: {...toRaw(debugArgument.value), ...toRaw(modelArgument.value)},
        filepath: filepath.value
    }
    const blob = new Blob([JSON.stringify(config)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    a_ref.value.href = url;
    a_ref.value.download = 'config.json';
    a_ref.value.click();
    URL.revokeObjectURL(url);
}

const configimport = async () => {
    let fileHandle;
    const pickerOpts = {
        types: [
            {
                description: "Json files",
                accept: {
                    "application/json": [".json"],
                },
            },
        ],
        excludeAcceptAllOption: true,
        multiple: false,
    };
    [fileHandle] = await window.showOpenFilePicker(pickerOpts);
    const file = await fileHandle.getFile();
    const fileContent = await file.text();
    try {
        const config = JSON.parse(fileContent);
        filepath.value = config.filepath
        debugArgument.value.timestep = config.argument.timestep
        debugArgument.value.dx = config.argument.dx
        debugArgument.value.totaltimesteps = config.argument.totaltimesteps
        debugArgument.value.wavefrequency = config.argument.wavefrequency
        debugArgument.value.thickness = config.argument.thickness
        modelArgument.value.width = config.argument.width
        modelArgument.value.height = config.argument.height
        modelArgument.value.depth = config.argument.depth
        modelArgument.value.sourcesList = config.argument.sourcesList
        modelArgument.value.isVShader = config.argument.isVShader
        modelArgument.value.vAreaList = config.argument.vAreaList
    } catch (e) {
        alert("文件格式错误，请检查")
        return
    }
}
</script>

<template>
        <div flex flex-row style="transition: 0.5s margin ease;" :style="{marginLeft: open ? '0' : '-40vw'}"  >
            <a ref="a_ref" style="display: none;"></a>
            <div style="background-color: #EEEEF6; overflow-y: scroll;scrollbar-width: none;">
                <div flex flex-row flex-justify-center w-40vw>
                    <div flex flex-col m0.5vw>
                        <SameInputs :title="inputGroupConstants.configImport.title">
                            <div>
                                <WithLabel :label="inputGroupConstants.configImport.label.configImport" >
                                    <button flex-shrink-0 @click="configimport">{{ "导入配置文件" }}</button>
                                </WithLabel>
                                <WithLabel :label="inputGroupConstants.configImport.label.configExport" >
                                    <button flex-shrink-0 @click="configExport">{{ "导出当前配置" }}</button>
                                </WithLabel>
                            </div>
                        </SameInputs>
                        <SameInputs :title="inputGroupConstants.baseConfig.title">
                            <div>
                                    <WithLabel :label="inputGroupConstants.baseConfig.label.modelImport" >
                                        <FilePathInput onceTips="上传文件" againTips="重新上传" v-model="filepath" />
                                    </WithLabel>
                                    <WithLabel  v-for="(v, _) in ['width', 'height', 'depth']" :label="inputGroupConstants.baseConfig.label[v]">
                                        <input v-model.number="modelArgument[v]" />
                                    </WithLabel>
                                    <WithLabel  :label="inputGroupConstants.baseConfig.label.sourcesList">
                                    </WithLabel>
                                    <div flex flex-col>
                                            <div v-for="(vs, ks) in modelArgument.sourcesList" mb-1rem>
                                                <label ml-1.5rem block>{{ `震源 ${ks} :` }}</label>
                                                <div block flex flex-row  flex-content-center  style="margin-top: 0.5rem;" >
                                                    <div block flex flex-row style="width: 75%;margin: auto;">
                                                        <div v-for="(v, k) in vs" inline>
                                                            <label>{{ ["X : ", "Y : ", "Z : "][k] }}</label>
                                                            <input style="width: 35%;" mr-1rem v-model.number="modelArgument.sourcesList[ks][k]" />
                                                        </div>
                                                        <div @click="() => modelArgument.sourcesList.splice(ks, 1)">{{ "一" }}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div w-full flex flex-row>
                                                <div m-auto @click="() =>　modelArgument.sourcesList.push([0,0,0])">{{ "十" }}</div>
                                            </div>
                                    </div>
                                    <WithLabel  :label="inputGroupConstants.baseConfig.label.isVShader">
                                        <input type="checkbox" v-model="modelArgument.isVShader" />
                                    </WithLabel>
                                    
                                    <WithLabel  :label="inputGroupConstants.baseConfig.label.vAreaList" v-if="modelArgument.isVShader">
                                    </WithLabel>
                                    <div flex flex-col  v-if="modelArgument.isVShader">
                                            <div v-for="(vs, ks) in modelArgument.vAreaList" mb-1rem>
                                                <label ml-1.5rem block>{{ `异常体 ${ks} :` }}</label>
                                                <div block flex flex-row  flex-content-center  style="margin-top: 0.5rem;" >
                                                    <div block flex flex-row style="width: 75%;margin: auto;">
                                                        <input style="width: 15%;" mr-1rem v-model.number="modelArgument.vAreaList[ks][0]" />
                                                        <div style="" mr-1rem >{{ "~" }}</div>
                                                        <input style="width: 15%;" mr-1rem v-model.number="modelArgument.vAreaList[ks][1]" />
                                                        <div @click="() => modelArgument.vAreaList.splice(ks, 1)">{{ "一" }}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div w-full flex flex-row>
                                                <div m-auto @click="() =>　modelArgument.vAreaList.push([0,0])">{{ "十" }}</div>
                                            </div>
                                    </div>

                                

                            </div>
                        </SameInputs>
                        <SameInputs :title="inputGroupConstants.arguments.title">
                            <div>
                                <WithLabel  v-for="(_, k) in debugArgument" :label="inputGroupConstants.arguments.label[k]">
                                    <input v-model.number="debugArgument[k]" />
                                </WithLabel>

                                <div flex flex-row flex-justify-around>
                                    <div @click="start">{{ "启动新模拟" }}</div>
                                    <div @click="stop">{{ "停止当前模拟" }}</div>
                                </div>
                            </div>
                        </SameInputs>
                    </div>
                </div>
            </div>
            <div flex flex-col flex-justify-center w-1vw h-full style="border-width: 0 1.5em;">
                <div flex flex-row flex-justify-center>
                    <div text-size-2xl m2vw style="user-select: none;color:#38393C" @click="open = !open">{{ open ? '<' : '>' }}</div>
                </div>
            </div>
        </div>
</template>

<style scoped>

</style>