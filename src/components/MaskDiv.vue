<script setup>
import { onMounted, computed, ref } from 'vue';

const mask = defineModel('maskNeed')
const max_block = defineModel('max')
const value = defineModel('value') 

const { max_press, min_press, transMode, base } = defineProps(['max_press', 'min_press', 'transMode', "base"])
const max_press_s = computed(() => transMode.value ? base.value + "" : `${max_press.value}`.substring(0, 6))
const min_press_s = computed(() => transMode.value ? -base.value + "" : `${min_press.value}`.substring(0, 7))

const transModeText = computed(() => transMode.value ? "绝对视图" : "相对视图")

const maxPrecent = computed(() => {
    return Number(Math.min(50, max_press.value * 50 / base.value) + 50).toFixed() + '%'
})
const minPrecent = computed(() => {
    return Number(50 + Math.max(-50, min_press.value * 50 / base.value)).toFixed() + '%'
})

const transModeChange = () => {
    emits("changeTransMode")
}
const range = ref(null)

const emits = defineEmits(["updateFileIndex", "drag", "wheel", "changeTransMode"])

const mask_cssvar = computed(
    ()=> {
        return mask.value ? "block" : "none"
    }
)

let colorMap = []
for (let i = 0; i <= 255; i++) colorMap[i] = [i, 0 , 255 - i];

const max = computed(() => (max_block.value.value + 1) * 5)
const currentFileIndex = computed(()=>value.value.value + 1)
onMounted(
    () => {
        range.value.oninput = (index) => emits("updateFileIndex", index.target.value - 1)
    }
)
</script>

<template>
    <div class="mask_container">
        <div w-full h-full @mousedown="e => emits('drag', e)" @mousewheel="e => emits('wheel', e)"><slot></slot></div>
        <div class="range" flex flex-row>
            <input w-full flex-grow-1 ref="range" type="range" min="1" :max="max" value="1" v-model.number="currentFileIndex"/>
            <label ml-1rem flex-shrink-0>{{ `${currentFileIndex} / ${max}` }}</label>
        </div>
        <div class="colorMap" flex flex-col>
            <div v-if="transMode.value" style="position: absolute;left: -1.65rem;vertical-align: bottom;" class="maxArr">{{ "___" }}</div>
            <div v-if="transMode.value" style="position: absolute;left: -1.65rem;vertical-align: bottom;" class="minArr">{{ "___" }}</div>
            <div style="position: absolute;top : -1.25rem" flex flex-row flex-justify-center w-full><div>{{ max_press_s }}</div></div>
            <div v-for="i in colorMap" w-full h-full :style="{backgroundColor: `rgb(${i[0]}, ${i[1]}, ${i[2]})`}"></div>
            <div style="position: absolute;bottom : -1.5rem;" flex flex-row flex-justify-center w-full><div>{{ min_press_s }}</div></div>
        </div>
        <div class="transModeOption" border-rd-2xl :class="transMode.value ? 'abs' : 'rel'" @click="transModeChange">
            <div m-0.5rem select-none>{{ transModeText }}</div>
        </div>
    </div>
</template>

<style scoped>
.mask_container {
    position: relative;
}
.mask_container ::before{
    content: "";
    display: v-bind(mask_cssvar);
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(255,255,255,0.3);
}

.range {
    position: absolute;
    bottom: 1rem;
    right: 5%;

    width: 90%;
}

.colorMap {
    position: absolute;
    right: 2.5rem;
    top: 35%;

    width: 1.5%;
    height: 30%;
}

.transModeOption {
    position: absolute;
    right: 2.5rem;
    top: 3.5%;

    font-size: small;
}

.abs {
    background-color: burlywood;
}

.rel {
    background-color: aqua;
}

.maxArr {
    bottom: v-bind(maxPrecent);
}

.minArr {
    bottom: v-bind(minPrecent);
}

</style>