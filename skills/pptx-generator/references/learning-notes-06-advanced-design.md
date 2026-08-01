# Practical PowerPoint Learning Notes — Advanced Design

[KNOWN|USER] This is an English translation of the advanced-camp and case-study portions of the user-selected `重点笔记.md`; visual descriptions are based on the corresponding user-provided `重点笔记.pdf`. Source: user-approved harness change, 2026-07-29. The material is retained as practical notes rather than authoritative product documentation.

## Advanced Training Camp L2

### Lesson 01 — A Formula for Refined Color Schemes

#### Choose One Main Color

1. **Brand dimension:** use the brand/company color or sample the logo.
2. **Style dimension:** select a color associated with the intended style.
3. **Scenario dimension:** consider ambient light and projection equipment.
   - In a bright room, prefer a light background and dark main color.
   - In a dark room, prefer a dark background and light main color.

#### Add Supporting Colors

[FRAME] Supporting colors add visual layers without replacing the main color.

#### Cross-Axis Color Method

1. Work in HSL.
2. Use `H` to control hue variety and `L` to control lightness hierarchy.

**Horizontal axis — hue hierarchy**

1. Add or subtract a fixed amount from `H`, keeping the total span within about `60°` in the source formula.
2. Alternatively, paste a hexadecimal color into an analogous-color tool and keep the analogous span within about `60°`.

**Vertical axis — lightness hierarchy**

1. Generate variants with PowerPoint theme colors.
2. The source note records a calculation of `L ± 12.8 × N`, where `N ≤ 10` and is an integer. It explains `12.8` as one-tenth of the `0–255` midpoint value `128`.
3. An approved color-scale tool can generate the same hierarchy. The source note names [Eva Design System](https://colors.eva.design/). `[UNVERIFIED]` Availability, licensing, and current behavior were not checked during this translation.

**Visual description — cross-axis palette matrix:** A pale diagram uses a horizontal axis labeled hue and a vertical axis labeled bright at the top and dark at the bottom. A black center circle marks the starting color. Empty circles form a regular grid around it, illustrating horizontal hue shifts and vertical lightness steps.

#### Light-Dark Pairing and Transparency

- Pair dark and light variants deliberately.
- Adjust transparency to make colors feel more integrated.

#### Extend the Palette into Gradients

1. Create an analogous-color gradient by changing hue.
2. Create a light-dark gradient by changing lightness.
3. If a large color span produces a gray middle, insert an intermediate color between the endpoints.

### Lesson 02 — Build a Unified Presentation Style

#### Horizontal Consistency

- Keep typography, color, background, and shape effects consistent across the deck.

#### Vertical Continuity

- Continue recurring visual motifs and relationships from one slide to the next.

#### Five Components of Presentation Style

1. Color.
2. Typography.
   - Use Chinese fonts for Chinese and Latin fonts for English where the design requires separate families.
   - Replace Chinese fonts across the deck first and English fonts second.
3. Background, which supports style and creates layout space.
4. Assets, which need style consistency and visual relationships.
   - Less-common but coherent icon styles make the visual identity more distinctive.
5. Shapes.

Use a PowerPoint theme so later editing remains practical.

**Visual description — visual-style matrix:** A white design-system board is divided into color, typography, background, shapes, and assets. Orange labels identify each category. The typography area pairs a Chinese title/body family with Helvetica for Western text. Black palette swatches, shape samples, and a dark background block show how the five components form one reusable visual grammar.

### Lesson 03 — Reinforce Style with Shapes

#### Change Shape Type

Three common base shapes:

1. circle;
2. square;
3. triangle.

Modify a square through:

1. clipped corners for technology, Chinese-inspired, or game styles;
2. rounded corners for cartoon, feminine, or business styles;
3. slanted sides for sports, automotive, or trend styles.

#### Add Texture

- Adjust transparency.
- The difficult part is finding an asset whose style fits; the notes mention `huaban.com` and `transparenttextures.com`. `[UNVERIFIED]` Availability, licensing, and current content were not checked during this translation.

#### Change Material

Use Boolean operations and layered treatments to suggest:

1. metal;
2. paper;
3. wood;
4. leather.

#### Semi-Transparent Material

1. Add a gradient fill.
2. Add 3D rotation.
3. Add depth.
4. Add an outline.

[FRAME] Fill transparency determines the glass-like surface, while outline color communicates its thickness.

### Lesson 04 — Create a More Structured Layout

#### Organize Information

**Organize:** divide information by category and relationship.

**Delete:** remove connectors and repeated subjects; convert linear prose into concise points.

**Layer:** identify hierarchy and increase typographic contrast. The note recommends a title-to-body ratio of `1.5×` or `2×`.

#### Plan the Layout

1. Establish one content area with guides.
2. Classify information with color blocks.
3. Use a `4 × 3` structural grid to normalize title and content-area positions.
4. Follow relevance: use containers to separate related content groups.

#### Change Visual Hierarchy

Use color blocks and alter:

1. size;
2. color;
3. solid-versus-transparent treatment.

#### Visualize Information

1. Add images, icons, or symbols.
2. Visualize logical relationships.

### Lesson 05 — Fix a Visually Flat Slide

[FRAME] In these notes, a “plain” page usually means weak visual hierarchy rather than a lack of decoration.

#### Text Hierarchy

1. Divide the content.
2. Identify hierarchy.
3. Strengthen contrast.

#### Color Hierarchy

1. Use light-dark variants for progressive levels.
2. Use analogous colors to distinguish parallel items.

#### Spatial Hierarchy

1. Introduce the Z axis through overlap or depth.
2. Increase the number of meaningful visual layers.

### Lesson 06 — Refined Shadow Effects

[FRAME] Shadows can strengthen depth and clarify the visual state of an element.

#### Procedure

1. **Choose the color.** Base it on the element or background; the note suggests a background-based shadow with substantially lower lightness.
2. **Choose the angle.** A common direction is `90°` downward. For products or people, place the shadow on the side opposite the implied light source.
3. **Soften it.** Adjust distance, size (`80–100` in the source note), and blur.
4. **Reduce concentration.** Increase transparency.

#### Limitations of Built-In Shadows

1. A single-color shadow cannot create multicolor projection. Simulate it with softened edges, and blur image-based shadow layers first.
2. A floating shadow may look rigid. Simulate it with a path gradient whose left stop is the shadow color and whose right stop matches the background at `100%` transparency.

### Lesson 07 — Add Decorative Elements to an Empty Slide

#### Choose the Element Type

Use three criteria:

1. relevance to the content;
2. ability to recur;
3. consistency with the style.

#### Search

- Search for `keyword + PNG` or an appropriate vector format under the applicable source rules.

#### Process the Asset

1. recolor;
2. blur;
3. add transparency;
4. split with Boolean Fragment.

#### Place the Asset

1. Use relative symmetry.
2. Choose a common vanishing/radiating point and vary positions around it.
3. Use triangular composition.

Change form through:

1. angle;
2. position;
3. vertical level;
4. scale;
5. solid-versus-transparent treatment.

Common directional patterns:

1. left to right;
2. center to edges;
3. diagonal.

### Lesson 08 — Natural, Fluid Animation

#### Why Animation Feels Unnatural

1. The ending behavior is wrong.
2. Adjacent animations do not connect smoothly.

#### Adjust Ending Behavior

- Smooth Start: slow first, then fast.
- Smooth End: fast first, then slow.
- Bounce End: controls the bounce duration.

#### Combine Animations

1. Replace a default Float In with Fade plus a straight motion path using Smooth End.
2. Use a reversed path to position the element precisely.
3. Replace a default Basic Zoom with Basic Zoom plus Grow/Shrink.
4. Use “With Previous” rather than “After Previous” and tune timing manually.

**Visual description — animation Gantt chart:** A pale timeline runs from `0 s` through `1.4 s`. Three peach group containers are staggered diagonally down the page. Each contains two orange horizontal bars representing paired animations. The second group starts before the first ends, and the third starts before the second ends, illustrating manually overlapped “With Previous” timing.

## PowerPoint Freelance/Monetization Course

### Technology-Style Case Study

#### Font Pairing

- Style/brand face: ZCOOL KuHei.
- Chinese title: Source Han Sans Bold.
- Chinese body: Source Han Sans Regular.
- Western title: Roboto Bold.
- Western body: Roboto Regular.

#### Visual Treatments

1. Use a path gradient to create a top light source.
2. Offset differently colored text copies to simulate thickness.
3. Look at event-page graphics for title-bar inspiration and search for HUD/FUI visual language.
4. Overlay texture.
5. Use deliberate staggered placement.
6. Present mockups on colored supporting shapes.
7. Build a platform from gradient trapezoids and rectangles.
