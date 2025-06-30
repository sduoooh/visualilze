<script setup>
import { computed } from 'vue';

import { chooseFileServerPath } from '../global/constants'

const props = defineProps(["onceTips", "againTips"])
const filepath = defineModel()
const pathImported = computed(() => {
  return filepath.value !== ''
})

async function getDir() {
  try {
    var res = await (await fetch(chooseFileServerPath)).json()
  } catch(e) {
    console.log(e)
    alert(`无法连接后端服务： ${chooseFileServerPath}`)
    return
  }
  filepath.value = res.filePath
}
</script>

<template>
    <div @click="getDir" flex flex-row>
        <div v-if="pathImported"  flex flex-col flex-justify-center mr-1rem><div>{{ filepath }}</div></div>
        <button flex-shrink-0>{{ pathImported ? props.againTips : props.onceTips }}</button>
    </div>
</template>

<style scoped>
</style>