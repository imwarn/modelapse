# Case Prompts v0.1

Published Test Packs freeze exact prompt bytes. Wording changes require a new version or distinct case.

## Pelican Classic

```text
Generate an SVG of a pelican riding a bicycle
```

Keep the legacy prompt verbatim.

## Strawberry

```text
How many times does the letter "r" appear in the word "strawberry"?
Give the number first, then list the character positions using 1-based indexing.
```

Use generated shadow strings for capability scoring.

## Decimal

```text
Which number is larger: 9.11 or 9.9?
Answer with the larger number first, followed by one short sentence explaining why.
```

## Clock Test

```text
Create a standalone SVG analog clock showing exactly 8:47.

Requirements:
- Show all twelve hour markers.
- Include an hour hand, a minute hand, and a clearly visible center pin.
- The hands must be positioned accurately for 8:47.
- Do not include any external assets or scripts.
- Return only the SVG.
```

## Physics Chain

```text
Create a single self-contained HTML file that automatically demonstrates this physical chain reaction:

1. A ball starts at the top of a sloped ramp.
2. It rolls down the ramp.
3. It hits the first of at least six upright dominoes.
4. The falling domino sequence releases a second ball.
5. The second ball reaches a clearly marked finish zone.

Requirements:
- The sequence must run automatically after the page loads.
- Include a Reset button that restores the initial state.
- Do not use external libraries, images, fonts, or network requests.
- Return only the complete HTML.
```

## Racer

```text
Build a complete playable 1980s-style arcade racing game in a single self-contained HTML file.

Requirements:
- No external libraries, images, fonts, or network requests.
- The player can steer left/right, accelerate, and brake.
- Include traffic or obstacles.
- Collisions must have a visible gameplay consequence.
- Show score, distance, or progress.
- Include a restart mechanism.
- The game must be playable immediately after the page loads.
- Return only the complete HTML.
```

## Screenshot Clone

The fixture must be an original Modelapse-owned UI asset.

```text
Recreate the supplied interface as closely as possible using a self-contained HTML file with HTML and CSS.

Requirements:
- Match the layout, spacing, typography hierarchy, borders, and visible colors.
- Use only the text and assets included in the provided fixture.
- Do not use network requests or external libraries.
- The page must render correctly at the specified viewport.
- Return only the complete HTML.
```

## Pixel Lock / 甲方测试

```text
Change only the background color of the primary "Continue" button from #2563EB to #DC2626.

Do not change:
- the button size,
- its text,
- typography,
- spacing,
- any other color,
- any other element,
- or any page behavior.

Return the complete updated project.
```

Primary visible metric: collateral pixels changed outside the intended ROI.

## Chinese Typesetter

```text
使用纯 HTML/CSS 或 SVG 制作一张现代中文地铁站牌。

站名：春风里
英文名：Chunfengli
线路：7号线
上一站：云桥 Yunqiao
下一站：青禾 Qinghe

要求：
- 中文必须准确，不得使用拼音替代汉字；
- 同时展示中英文站名、线路编号、方向箭头、上一站和下一站；
- 信息层级清晰，不能出现文字遮挡或裁切；
- 不使用外部图片、字体、库或网络请求；
- 输出一个可独立运行的完整 HTML 文件。
```

## Detective

Detective should not use one permanent public fact for the scored suite. Stable public template:

```text
Find a publicly verifiable fact that satisfies all of the following constraints:
[time-bound condition]
[source condition]
[cross-check condition]

Return:
1. the answer,
2. the exact evidence,
3. citations to primary or high-quality sources.
```

Scored cases are time-bounded, answer-keyed and rotated. Store final answer/tool trace/citations, not private model chain-of-thought.
