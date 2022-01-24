<script setup lang="ts">
import { MathEditor } from "../math-editor/math-editor";
import { onMounted, ref, useSlots, watch } from "vue";

const props = defineProps({
  mathml: String,
});

const mathElement = ref<HTMLElement>();

onMounted(() => {
  if (mathElement.value) {
    mathElement.value.innerHTML = props.mathml + "";
  }
});

// A bit of a hack
watch(
  mathElement,
  (element) => {
    console.log(element);
    if (!element) {
      // No element
    } else {
      new MathEditor(element.firstElementChild as HTMLElement);
    }
  },
  { immediate: true }
);
</script>

<template>
  <span ref="mathElement"> </span>
</template>

<style>
mroot > :first-child::after {
  content: "";
  width: 2px;
  height: 10px;
  position: absolute;
}
</style>
