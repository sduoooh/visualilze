<script setup>
import { ref } from 'vue';

import InputGroup from './views/InputGroup.vue';
import MaskDiv from './components/MaskDiv.vue';

import { Workers } from './utils/workers'
import { onMounted } from 'vue';

const canvas = ref(null)
const canvas_container = ref(null)
const opfs = new Workers()

const mask = ref(false)
const force = ref(false)

const updateArugument = (argument) => {
  console.log(argument)
  if (opfs.status.value === 0) {
    opfs.init(canvas.value.transferControlToOffscreen(), argument, canvas_container.value.clientWidth, canvas_container.value.clientHeight)
  }
  if (opfs.status.value === 3) {
    opfs.ParamUpdate(argument)
  }
}
const updateFileIndex = (index) => {
  opfs.FileIndexUpdate(index)
}

const stop = () => {
  if (opfs.status.value != 2) return
  opfs.Stop()
}

const updateFov = (e) => {
  opfs.FovUpdate(e.deltaY)
}

const changeTransMode = (e) => {
  opfs.ChangeTransMode()
}

const watchDrag = (e) => {
  if (e.button != 0) return

  let previousX = e.clientX;
  let previousY = e.clientY;

  const onMouseMove = (e) => {
    const currentX = e.clientX;
    const currentY = e.clientY;

    const deltaX = currentX - previousX;
    const deltaY = currentY - previousY;

    previousX = currentX;
    previousY = currentY;

    force.value = !force.value
    opfs.CamPosUpdate(deltaX, deltaY);
  };

  const onMouseUp = () => {
    e.target.removeEventListener('mousemove', onMouseMove);
    e.target.removeEventListener('mouseup', onMouseUp);
    e.target.removeEventListener('mouseleave', onMouseUp);
  };

  e.target.addEventListener('mousemove', onMouseMove);
  e.target.addEventListener('mouseup', onMouseUp);
  e.target.addEventListener('mouseleave', onMouseUp);
};

onMounted(()=> {
  canvas_container.value = document.querySelector("#main_box > div.mask_container")
  const observer = new ResizeObserver(async _ => {
    opfs.AspectUpdate(canvas_container.value.clientWidth, canvas_container.value.clientHeight)
  });
  observer.observe(canvas.value);
})
</script>

<template>
  <div id="main_box" w-screen h-screen flex flex-row >
    <InputGroup @stop="stop" @update="updateArugument"></InputGroup>
    <MaskDiv :max_press="opfs.max_press" :min_press="opfs.min_press" :base="opfs.base" :transMode="opfs.transMode" v-model:mask-need="mask" v-model:max="opfs.currentMaxFileBlockNum" v-model:value="opfs.currentFileIndex" @updateFileIndex="updateFileIndex" @drag="watchDrag" @wheel="updateFov" @changeTransMode="changeTransMode" w-full h-full>
      <canvas :force="force" ref="canvas" style="background-color: #E0F1FF;display: block;" w-full h-full>
      </canvas>
    </MaskDiv>
  </div>
</template>

<style scoped>
  #main_box{
    background-color: antiquewhite;
  }
</style>