<script setup>
const props = defineProps(['label'])
</script>

<template>
    <div flex flex-row m-1rem>
        <div mr-2rem flex flex-col flex-justify-center><div>{{ props.label }}</div></div>
        <div inline flex flex-justify-center>
            <slot></slot>
        </div>
    </div>
</template>