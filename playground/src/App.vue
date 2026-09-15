<script setup lang="ts">
import { computed, ref } from 'vue'
import { XBot, EXPRESSIONS, SHAPES } from 'xbot'

const size = ref(160)
const sizeInputType = ref<'range' | 'number'>('range')
const hex = ref('#3ecf8e')
const shape = ref('cercle')
const expression = ref('neutre')

const shapeLabels: Record<string, string> = {
  cercle: '圆形',
  galet: '卵石',
  squircle: '圆角方形',
  capsule: '胶囊',
  triangle: '三角形',
  hexagone: '六边形',
  nuage: '云朵',
  goutte: '水滴',
}

const expressionLabels: Record<string, string> = {
  neutre: '平静',
  attentif: '专注',
  surpris: '惊讶',
  excite: '兴奋',
  heureux: '开心',
  hilare: '大笑',
  colere: '生气',
  triste: '难过',
  effraye: '害怕',
  mefiant: '怀疑',
  confus: '困惑',
  curieux: '好奇',
  fier: '得意',
  timide: '羞怯',
  blase: '无趣',
  somnolent: '困倦',
}

const tile = 72

const snippet = computed(
  () =>
    `<XBot :size="${size.value}" color="${hex.value}" shape="${shape.value}" expression="${expression.value}" />`,
)

const copied = ref(false)

async function copySnippet() {
  await navigator.clipboard.writeText(snippet.value)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}
</script>

<template>
  <main style="padding: 1.5rem; font-family: system-ui; display: flex; justify-content: center; align-items: center; ">
    <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 1rem;padding: 48px; ">
    <XBot
      :size="size"
      :color="hex"
      :shape="shape"
      :expression="expression"
      style="margin: 1rem 0"
    />
      <label>
      size
      <select v-model="sizeInputType">
        <option value="range">range</option>
        <option value="number">number</option>
      </select>
      <input
        v-model.number="size"
        :type="sizeInputType"
        min="64"
        max="320"
      />
      {{ size }}
    </label>
    <label>
      color
      <input v-model="hex" type="color" />
    </label>
    <button type="button" @click="copySnippet">
      {{ copied ? '已复制' : '复制代码' }}
    </button>
    </div>
    <div>
    <h2 style="font-size: 1rem; margin: 1.25rem 0 0.5rem">形状</h2>
    <div
      style="
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.5rem;
        text-align: center;
        font-size: 12px;
      "
    >
      <button
        v-for="s in SHAPES"
        :key="s.id"
        type="button"
        :style="{
          border:
            shape === s.id ? '2px solid #1a1a1a' : '2px solid transparent',
          borderRadius: '12px',
          padding: '0.25rem',
          background: 'transparent',
          cursor: 'pointer',
        }"
        @click="shape = s.id"
      >
        <XBot
          :size="tile"
          :color="hex"
          :shape="s.id"
          expression="neutre"
          :frozen-at="0"
        />
        <div>{{ shapeLabels[s.id] ?? s.id }}</div>
      </button>
    </div>

    <h2 style="font-size: 1rem; margin: 1.25rem 0 0.5rem">表情</h2>
    <div
      style="
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.5rem;
        text-align: center;
        font-size: 12px;
      "
    >
      <button
        v-for="e in EXPRESSIONS"
        :key="e.id"
        type="button"
        :style="{
          border:
            expression === e.id
              ? '2px solid #1a1a1a'
              : '2px solid transparent',
          borderRadius: '12px',
          padding: '0.25rem',
          background: 'transparent',
          cursor: 'pointer',
        }"
        @click="expression = e.id"
      >
        <XBot
          :size="tile"
          :color="hex"
          shape="cercle"
          :expression="e.id"
          :frozen-at="0"
        />
        <div>{{ expressionLabels[e.id] ?? e.id }}</div>
      </button>
    </div>
    </div>
  </main>
</template>
