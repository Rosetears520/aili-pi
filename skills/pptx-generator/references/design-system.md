# Design System

[FRAME] Use this reference when no user-supplied template or brand system controls the deck. For human-curated reasoning about color, typography, content areas, spacing, and visual style, also consult [`human-design-playbook.md`](human-design-playbook.md).

## Color Palette Reference

| # | Name | Colors | Style | Use Cases | Tips |
|---|------|--------|-------|-----------|------|
| 1 | Modern & Wellness | `#006d77` `#83c5be` `#edf6f9` `#ffddd2` `#e29578` | Fresh, soothing | Healthcare, counseling, skincare, yoga/spa | Deep teal for titles, light pink for background |
| 2 | Business & Authority | `#2b2d42` `#8d99ae` `#edf2f4` `#ef233c` `#d90429` | Formal, classic | Annual reports, financial analysis, corporate intro, government | Deep blue for professionalism, bright red to highlight data |
| 3 | Nature & Outdoors | `#606c38` `#283618` `#fefae0` `#dda15e` `#bc6c25` | Grounded, earthy | Outdoor gear, environmental, agriculture, historical culture | Dark green base, cream text |
| 4 | Vintage & Academic | `#780000` `#c1121f` `#fdf0d5` `#003049` `#669bbc` | Classic, scholarly | Academic lectures, history reviews, museums, heritage brands | Strong contrast between deep red and deep blue |
| 5 | Soft & Creative | `#cdb4db` `#ffc8dd` `#ffafcc` `#bde0fe` `#a2d2ff` | Dreamy, candy-toned | Mother & baby, desserts, women's fashion, kindergarten | Use dark gray or black for text |
| 6 | Bohemian | `#ccd5ae` `#e9edc9` `#fefae0` `#faedcd` `#d4a373` | Gentle, muted | Wedding planning, home decor, organic food, slow living | Cream background, green-brown accents |
| 7 | Vibrant & Tech | `#8ecae6` `#219ebc` `#023047` `#ffb703` `#fb8500` | High energy, sporty | Sports events, gyms, startup pitches, youth education | Deep blue for stability, orange as focal accent |
| 8 | Craft & Artisan | `#7f5539` `#a68a64` `#ede0d4` `#656d4a` `#414833` | Rustic, coffee-toned | Coffee shops, handicrafts, traditional culture, bakery | Suited for paper/leather textures |
| 9 | Tech & Night | `#000814` `#001d3d` `#003566` `#ffc300` `#ffd60a` | Deep, luminous | Tech launches, astronomy, night economy, luxury automobiles | Works best on a dark background |
| 10 | Education & Charts | `#264653` `#2a9d8f` `#e9c46a` `#f4a261` `#e76f51` | Clear, logical | Statistical reports, education, market analysis, general business | Well suited to categorical charts |
| 11 | Forest & Eco | `#dad7cd` `#a3b18a` `#588157` `#3a5a40` `#344e41` | Monochrome gradient, forest | Landscape design, ESG reports, environmental causes, botanical | Monochrome palette is safe and cohesive |
| 12 | Elegant & Fashion | `#edafb8` `#f7e1d7` `#dedbd2` `#b0c4b1` `#4a5759` | Muted, Morandi tones | Haute couture, art galleries, beauty brands, magazine style | Negative space is key |
| 13 | Art & Food | `#335c67` `#fff3b0` `#e09f3e` `#9e2a2b` `#540b0e` | Rich, vintage-poster | Food documentaries, art exhibitions, ethnic themes, vintage restaurants | Works well with large color blocks |
| 14 | Luxury & Mysterious | `#22223b` `#4a4e69` `#9a8c98` `#c9ada7` `#f2e9e4` | Cool, purple-toned | Jewelry showcases, hotel management, high-end consulting, psychology | Purple evokes premium atmosphere |
| 15 | Pure Tech Blue | `#03045e` `#0077b6` `#00b4d8` `#90e0ef` `#caf0f8` | Futuristic, clean | Cloud/AI, water/ocean, hospitals, clean energy | Deep ocean to sky gradient |
| 16 | Coastal Coral | `#0081a7` `#00afb9` `#fdfcdc` `#fed9b7` `#f07167` | Refreshing, summery | Travel, summer events, beverage brands, ocean themes | Teal and coral as complementary focal colors |
| 17 | Vibrant Orange Mint | `#ff9f1c` `#ffbf69` `#ffffff` `#cbf3f0` `#2ec4b6` | Bright, cheerful | Children's events, promotional posters, FMCG, social media | Orange grabs attention, mint feels fresh |
| 18 | Platinum White Gold | `#0a0a0a` `#0070F3` `#D4AF37` `#f5f5f5` `#ffffff` | Premium, professional | Agent products, corporate websites, fintech, luxury brands | White-gold base, blue for action, gold for emphasis |

The table uses CSS-style `#` prefixes for readability. Remove the prefix when passing a color to PptxGenJS.

---

### Agent Design System — Full Color Scale

[FRAME] The following Platinum White-Gold tokens provide one optional scale for fine-grained design work.

The eight-character opacity tokens are visual references. Do not pass them directly to PptxGenJS; use a six-character color plus the runtime's transparency/opacity property.

#### White Scale (Backgrounds & Light Surfaces)

| Token | Value | Usage |
|-------|-------|-------|
| white-0 | `#ffffff` | Primary background |
| white-50 | `#fefefe` | Slightly warm white |
| white-75 | `#fcfcfc` | Near-white |
| white-100 | `#fafafa` | Secondary background |
| white-200 | `#f7f7f7` | Card background |
| white-300 | `#f5f5f5` | Tertiary background |
| white-400 | `#f0f0f0` | Separator zones |
| white-500 | `#ebebeb` | Light border |
| white-600 | `#e5e5e5` | Disabled background |
| white-700 | `#e0e0e0` | Deep white-gray |
| white-800 | `#d9d9d9` | Placeholder |
| white-900 | `#d4d4d4` | Divider lines |
| white-1000 | `#cccccc` | Deepest white |

#### Gold Scale (Platinum Business Accent)

| Token | Value | Usage |
|-------|-------|-------|
| gold-25 | `#FFFDF5` | Extremely light gold background |
| gold-50 | `#FEF9E7` | Light gold background |
| gold-75 | `#FCF3D0` | Pale gold highlight |
| gold-100 | `#FAECB8` | Gold hover state |
| gold-200 | `#F5DC8A` | Bright gold accent |
| gold-300 | `#E8C860` | Gold hover |
| gold-400 | `#D4AF37` | **Primary gold (core)** |
| gold-500 | `#B8972E` | Gold text |
| gold-600 | `#9A7E26` | Deep gold accent |
| gold-700 | `#7C651E` | Dark gold border |
| gold-800 | `#5E4C16` | Deep gold background |
| gold-900 | `#40330F` | Very deep gold |
| gold-1000 | `#221A08` | Black gold |

#### Blue Scale (Primary Action Color)

| Token | Value | Usage |
|-------|-------|-------|
| blue-25 | `#F0F7FF` | Extremely light blue background |
| blue-50 | `#E0EFFF` | Info alert background |
| blue-75 | `#C2DFFF` | Light blue highlight |
| blue-100 | `#A3CFFF` | Disabled blue |
| blue-200 | `#66AFFF` | Bright blue |
| blue-300 | `#338FFF` | Blue hover |
| blue-400 | `#0070F3` | **Primary blue (core)** |
| blue-500 | `#005FCC` | Blue text |
| blue-600 | `#004FA6` | Deep blue accent |
| blue-700 | `#003F80` | Dark blue border |
| blue-800 | `#002F5A` | Deep blue background |
| blue-900 | `#001F3D` | Very deep blue |
| blue-1000 | `#001026` | Black blue |

#### Gray Scale (Text & Neutral Colors)

| Token | Value | Usage |
|-------|-------|-------|
| gray-0 | `#ffffff` | White |
| gray-50 | `#fafafa` | Extremely light gray |
| gray-75 | `#f5f5f5` | Light gray background |
| gray-100 | `#ededed` | Light divider |
| gray-200 | `#d4d4d4` | Light border |
| gray-300 | `#a3a3a3` | Quaternary text |
| gray-400 | `#737373` | Tertiary text |
| gray-500 | `#525252` | Secondary text |
| gray-600 | `#404040` | Dark gray |
| gray-700 | `#2e2e2e` | Dark background |
| gray-800 | `#1f1f1f` | Deep background |
| gray-900 | `#141414` | Very deep background |
| gray-1000 | `#0a0a0a` | **Primary text (core)** |

#### Opacity Values

##### Opacity Black

| Opacity | Value | Usage |
|---------|-------|-------|
| 0% | `#0a0a0a00` | Fully transparent |
| 2% | `#0a0a0a05` | Subtle overlay |
| 4% | `#0a0a0a0a` | Secondary interactive background |
| 8% | `#0a0a0a14` | Border / divider |
| 15% | `#0a0a0a26` | Pressed state |
| 20% | `#0a0a0a33` | Light overlay |
| 25% | `#0a0a0a40` | Medium overlay |
| 50% | `#0a0a0a80` | Semi-transparent |
| 70% | `#0a0a0ab2` | Deep overlay |
| 80% | `#0a0a0acc` | Hover state |
| 90% | `#0a0a0ae5` | Tooltip |
| 95% | `#0a0a0af2` | Modal |

##### Opacity White

| Opacity | Value | Usage |
|---------|-------|-------|
| 0% | `#ffffff00` | Fully transparent |
| 2% | `#ffffff05` | Subtle overlay |
| 4% | `#ffffff0a` | Secondary interactive background |
| 8% | `#ffffff12` | Border / divider |
| 15% | `#ffffff26` | Pressed state |
| 20% | `#ffffff33` | Light overlay |
| 25% | `#ffffff40` | Medium overlay |
| 50% | `#ffffff80` | Semi-transparent |
| 70% | `#ffffffb2` | Deep overlay |
| 80% | `#ffffffcc` | Hover state |
| 90% | `#ffffffe5` | Tooltip |
| 95% | `#fffffff2` | Modal |

---

## Palette Discipline

### Start from the Controlling Source

1. If the user supplies a brand palette or template, preserve its semantic roles and existing light/dark hierarchy.
2. If no palette exists, choose one main color, neutrals, and only the supporting colors needed to distinguish information.
3. Keep repeated roles consistent: title, body, background, accent, positive/negative data, and muted structure.

When a template already contains approved variants, reuse them. For a from-scratch deck, derive and record controlled hue, lightness, or transparency variants instead of adding unrelated colors slide by slide.

```javascript
// Correct: Using palette colors
slide.addShape(pres.shapes.RECTANGLE, { fill: { color: theme.primary } });
slide.addText("Title", { color: theme.accent });

// Poor default: an untracked color with no defined role
slide.addShape(pres.shapes.RECTANGLE, { fill: { color: "1a1a2e" } });
```

### Gradients

Use a gradient only when it has a job: protect text over an image, establish a light source, extend a background, or reinforce depth. Keep its direction and stops consistent with the composition. If the selected PPTX runtime cannot create an editable gradient, use a supported static gradient image or a solid-color approximation and report the editability trade-off.

### Animations and Transitions

Add animation only when the brief requires it and the selected runtime can preserve or author it reliably. Use animation to reveal sequence, connect matching elements, or focus attention; otherwise keep the deck static. Mark animation behavior `Unverified` unless it is inspected in a compatible presentation runtime.

---

## Font Contract

[FRAME] Follow [`font-policy.md`](font-policy.md). Choose typefaces from the controlling template/brand, explicit user choice, accepted profile/configuration, and fonts verified in the actual build/render environments; do not apply a universal language default.

[FRAME] Microsoft YaHei, Arial, and Calibri are compatibility examples only when a controlling template requires them or the user explicitly approves them as fallbacks. Record title/body/data/source roles and any approved fallback in `font-contract.json`.

[FRAME] For mixed-language content, verify every required script coverage in both build and render environments. A visually interesting pairing is still invalid when it conflicts with the controlling source or cannot render required glyphs.

### Body Weight

Prefer regular weight for ordinary body, caption, legend, and footnote text. Reserve bold for titles, labels, and selected emphasis so hierarchy remains visible.

- Body paragraphs, descriptions → normal weight
- Captions, legends, footnotes → normal weight
- Reserve bold for titles and headings only

```javascript
// Correct: font roles come from the current design/font contracts
slide.addText("Main Title", { bold: true, fontSize: 36, fontFace: theme.titleFont });
slide.addText("Body text here.", { bold: false, fontSize: 14, fontFace: theme.bodyFont });

// Poor default: body emphasis everywhere flattens hierarchy
slide.addText("Body text here.", { bold: true, fontSize: 14 });
```

---

## Style Recipes

The same design can be rendered in 4 distinct visual styles by adjusting corner radius (`rectRadius`) and spacing. Choose the style recipe that fits the presentation tone.

> **Unit note**: PptxGenJS uses inches. Slide dimensions are 10" x 5.625" (LAYOUT_16x9).

### Style Overview

| Style | Corner Radius | Spacing | Best For |
|-------|--------------|---------|----------|
| **Sharp & Compact** | 0 ~ 0.05" | Tight | Data-dense, tables, professional reports |
| **Soft & Balanced** | 0.08" ~ 0.12" | Moderate | Corporate, business presentations, general use |
| **Rounded & Spacious** | 0.15" ~ 0.25" | Relaxed | Product intros, marketing, creative showcases |
| **Pill & Airy** | 0.3" ~ 0.5" | Open | Brand showcases, launch events, premium presentations |

### Sharp & Compact

**Visual character**: Geometric, high information density, formal and serious.

| Category | Value (inches) | Notes |
|----------|---------------|-------|
| Corner radius — small | 0" | Full right angle |
| Corner radius — medium | 0.03" | Micro-rounded |
| Corner radius — large | 0.05" | Slight rounding |
| Element padding | 0.1" ~ 0.15" | Compact |
| Element gap | 0.1" ~ 0.2" | Compact |
| Page margin | 0.3" | Narrow |
| Block gap | 0.25" ~ 0.35" | Compact |

### Soft & Balanced

**Visual character**: Moderate rounding, comfortable whitespace, professional yet approachable.

| Category | Value (inches) | Notes |
|----------|---------------|-------|
| Corner radius — small | 0.05" | Slight rounding |
| Corner radius — medium | 0.08" | Medium rounding |
| Corner radius — large | 0.12" | Larger rounding |
| Element padding | 0.15" ~ 0.2" | Moderate |
| Element gap | 0.15" ~ 0.25" | Moderate |
| Page margin | 0.4" | Standard |
| Block gap | 0.35" ~ 0.5" | Moderate |

### Rounded & Spacious

**Visual character**: Large corners, generous whitespace, friendly and modern.

| Category | Value (inches) | Notes |
|----------|---------------|-------|
| Corner radius — small | 0.1" | Medium rounding |
| Corner radius — medium | 0.15" | Large rounding |
| Corner radius — large | 0.25" | Very large rounding |
| Element padding | 0.2" ~ 0.3" | Relaxed |
| Element gap | 0.25" ~ 0.4" | Relaxed |
| Page margin | 0.5" | Wide |
| Block gap | 0.5" ~ 0.7" | Relaxed |

### Pill & Airy

**Visual character**: Full pill-shaped corners, abundant whitespace, light and open feel, strong brand presence.

| Category | Value (inches) | Notes |
|----------|---------------|-------|
| Corner radius — small | 0.2" | Large rounding |
| Corner radius — medium | 0.3" | Pill shape |
| Corner radius — large | 0.5" | Full pill |
| Element padding | 0.25" ~ 0.4" | Open |
| Element gap | 0.3" ~ 0.5" | Open |
| Page margin | 0.6" | Wide |
| Block gap | 0.6" ~ 0.9" | Open |

### Component Style Mapping

| Component | Sharp | Soft | Rounded | Pill |
|-----------|-------|------|---------|------|
| **Button / Tag** | rectRadius: 0 | rectRadius: 0.05 | rectRadius: 0.1 | rectRadius: 0.2 |
| **Card / Container** | rectRadius: 0.03 | rectRadius: 0.1 | rectRadius: 0.2 | rectRadius: 0.3 |
| **Image Container** | rectRadius: 0 | rectRadius: 0.08 | rectRadius: 0.15 | rectRadius: 0.25 |
| **Input Field** | rectRadius: 0 | rectRadius: 0.05 | rectRadius: 0.1 | rectRadius: 0.2 |
| **Badge** | rectRadius: 0.02 | rectRadius: 0.05 | rectRadius: 0.08 | rectRadius: 0.15 |
| **Avatar Frame** | rectRadius: 0 | rectRadius: 0.1 | rectRadius: 0.2 | rectRadius: 0.5 (circle) |

#### PptxGenJS Corner Radius Examples

```javascript
// Sharp style card
slide.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 1, w: 4, h: 2.5,
  fill: { color: "F5F5F5" },
  rectRadius: 0.03
});

// Rounded style card
slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 0.5, y: 1, w: 4, h: 2.5,
  fill: { color: "F5F5F5" },
  rectRadius: 0.2
});

// Pill style button (height 0.4", rectRadius 0.2")
slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 3, y: 4, w: 2, h: 0.4,
  fill: { color: "4A90D9" },
  rectRadius: 0.2
});
```

### Mixing Rules

#### 1. Outer container corner >= inner element corner

```javascript
// Correct: outer > inner
card:   rectRadius: 0.2
button: rectRadius: 0.1

// Wrong: inner > outer → visual overflow effect
card:   rectRadius: 0.1
button: rectRadius: 0.2
```

#### 2. Information density drives spacing

| Zone Type | Recommended Style |
|-----------|------------------|
| Data display zone | Sharp / Soft (compact spacing) |
| Content browsing zone | Rounded / Pill (relaxed spacing) |
| Title zone | Soft / Rounded (moderate spacing) |

#### 3. Corner radius vs element height

| Element Height | Sharp | Soft | Rounded | Pill |
|---------------|-------|------|---------|------|
| Small (< 0.3") | 0" | 0.03" | 0.08" | height/2 |
| Medium (0.3" ~ 0.6") | 0.02" | 0.05" | 0.12" | height/2 |
| Large (0.6" ~ 1.2") | 0.03" | 0.08" | 0.2" | 0.3" |
| Extra large (> 1.2") | 0.05" | 0.12" | 0.25" | 0.4" |

> **Pill tip**: For a perfect pill shape, set `rectRadius = element height / 2`

### Typography Scale (PPT)

| Usage | Size (pt) | Notes |
|-------|-----------|-------|
| Annotations / Sources | 10 ~ 12 | Minimum readable size |
| Body / Description | 14 ~ 16 | Standard body |
| Subtitle | 18 ~ 22 | Secondary heading |
| Title | 28 ~ 36 | Page title |
| Large Title | 44 ~ 60 | Cover / section title |
| Data Callout | 60 ~ 96 | Key number display |

### Spacing Scale (PPT)

Based on 10" x 5.625" slide dimensions:

| Usage | Recommended (inches) |
|-------|---------------------|
| Icon-to-text gap | 0.08" ~ 0.15" |
| List item spacing | 0.15" ~ 0.25" |
| Card inner padding | 0.2" ~ 0.4" |
| Element group gap | 0.3" ~ 0.5" |
| Page safe margin | 0.4" ~ 0.6" |
| Major block gap | 0.5" ~ 0.8" |

### Quick Selection Guide

| Presentation Type | Recommended Style | Reason |
|------------------|------------------|--------|
| Finance / Data reports | Sharp & Compact | High density, serious and precise |
| Corporate / Business | Soft & Balanced | Balances professionalism and approachability |
| Product intro / Marketing | Rounded & Spacious | Modern feel, friendly |
| Launch events / Brand | Pill & Airy | Premium feel, visual impact |
| Training / Education | Soft / Rounded | Clear, readable, friendly |
| Tech sharing | Sharp / Soft | Professional, information-dense |
