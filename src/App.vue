<script setup lang="ts">
import MathEditor from "./components/MathEditor.vue";
</script>

<template>
  <MathEditor
    mathml="<math
        v-pre
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
