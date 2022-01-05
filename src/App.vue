<script setup lang="ts">
import MathEditor from "./components/MathEditor.vue";
</script>

<template>
  <MathEditor
    mathml="<math
        display='block'
        style='font-family: STIX Two'
        tabindex='0'
      >
        <msqrt>
          <msqrt>
            <mi>x</mi>
            <mi>x</mi>
            <mi>x</mi>
          </msqrt>
          <mi>x</mi>
        </msqrt>
        <mfrac>
          <mi>x</mi>
          <mi>x</mi>
        </mfrac>
      </math>"
  >
  </MathEditor>

  <math>
    <mn>-1.3</mn>
    <mn>-1</mn>
    <mn>.3</mn>

    <mo>-</mo>
    <mn>1.3</mn>
  </math>
</template>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
