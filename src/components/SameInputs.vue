<script setup>
const props = defineProps(['title'])
</script>

<template>
    <div flex flex-col m-1rem style="border-radius: 3%;background-color:rgb(199,210,199);">
        <h2 style="margin: 2rem 2rem 0.5rem 2rem;">{{ props.title }}</h2>
        <div style="margin: 0.5rem 2rem 2rem 2rem;">
            <slot></slot>
        </div>
    </div>
</template>