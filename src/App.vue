<script setup lang="ts">
import MathEditor from "./components/MathEditor.vue";
</script>

<template>
  <MathEditor
    mathml="<math
        display='block'
        style='font-family: STIX Two'
      >
        <mo>-</mo>
        <mn>2</mn>
        <mi>x</mi>
        <mo>+</mo>
        <mi>y</mi>
        <mo>*</mo>
        <mn>2</mn>
      </math>"
  >
  </MathEditor>

  <MathEditor
    mathml="<math
        display='block'
        style='font-family: STIX Two'
      >
        <msqrt>
          <msqrt>
            <mi>x</mi>
            <mi>x</mi>
            <mi>x</mi>
          </msqrt>
          <mi>a</mi>
        </msqrt>
        <mfrac>
          <mi>b</mi>
          <mi>c</mi>
        </mfrac>
      </math>"
  >
  </MathEditor>

  <MathEditor
    mathml="<math>
    <mn>-1214.3001</mn>
    <mn>-1</mn>
    <mn>.3</mn>

    <mo>-</mo>
    <mn>1.3</mn>
  </math>"
  >
  </MathEditor>

  <MathEditor
    mathml="<math>
    <mfrac>
          <mn>1.22</mn>
          <mtext>henlo</mtext>
        </mfrac>
  </math>"
  >
  </MathEditor>

  <MathEditor
    mathml="<math>
    <mrow><mo>-</mo><msub><mi>x</mi><mn>2</mn></msub><mo>+</mo><msup><mi>y</mi><mfrac><mn>2</mn><mrow><mi>k</mi><mo>+</mo><mn>1</mn></mrow></mfrac></msup></mrow>
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
