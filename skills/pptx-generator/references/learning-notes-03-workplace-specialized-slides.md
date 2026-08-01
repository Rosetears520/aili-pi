# Practical PowerPoint Learning Notes — Specialized Workplace Slides

[KNOWN|USER] This is an English translation of the later workplace-course portion of the user-selected `重点笔记.md`; visual descriptions are based on the corresponding user-provided `重点笔记.pdf`. Source: user-approved harness change, 2026-07-29. The material is retained as practical notes rather than authoritative product documentation.

## Fourteen-Day Workplace PowerPoint Course, Continued

### Lesson 14 — Chart Optimization

#### State the Conclusion

1. A chart title should present a conclusion rather than merely describe the data.
2. Express a summary judgment derived from the evidence; the note suggests a `verb + adjective + noun` structure.

#### Choose the Chart Type

**Visual description — chart-selection matrix:** A gray-and-orange matrix maps five data relationships—composition, ranking, time series, frequency distribution, and correlation—against five chart families: pie, bar, column, line, and scatter. Small example charts appear in the cells where each family is suitable. Pie is shown for composition; bars for ranking and correlation; columns for time series and frequency; lines for time series and frequency; and scatter for correlation.

#### Change the Colors

- For multiple series, select one main color and use controlled hue/lightness variants to distinguish the series.

#### Highlight the Focus

1. Contrast light and dark values, or combine a saturated accent with black, white, and gray.
2. Add a supporting background where it clarifies the emphasis.

### Lesson 15 — Table Optimization

#### Determine the Layout

- Design the table inside the established content area.

#### Change the Hierarchy

Highlight important table information by changing:

1. font weight, size, or color;
2. whether a cell has a background and how light or dark that background is;
3. rule thickness, color, and solid/dashed style. Rules are commonly used on the first and last rows and to separate internal sections.

#### Correct Alignment

- Draw alignment lines mentally or with guides before styling.
- Use visible differences between heavy and light rules.
- Left-align text longer than two lines.
- Right-align decimals, use consistent decimal places, and add thousands separators.
- Switch to an English input method when entering punctuation that must use Western-width characters.

#### Special Cases

- Merge repeated information to reduce noise.
- For a table with logical relationships, reorganize the cells into modules so the logic is visible.

### Lesson 16 — Pyramid Slides

#### Alignment

1. Align the overall page to a matrix or shared guide.
2. Align the information within each column to the left or right as appropriate.

#### Pyramid Styling

1. **Color hierarchy:** use light-dark changes for different levels and a consistent hue for parallel levels.
2. **From flat to dimensional:** add diamond shapes and make side surfaces lighter or darker.

#### Supporting Graphics

Avoid an empty or overly mechanical result by adding:

1. a supporting rectangle as wide as the pyramid, with deliberate light-dark contrast;
2. supporting lines.

### Lesson 17 — Team Introduction

#### Process the Portraits

1. Unify backgrounds by removing them and placing the subjects on one consistent color block.
2. Align the eye line while keeping foreheads and chins at comparable heights.
   - Use aspect-ratio cropping for consistency and speed.
   - Keep the head, neck, and shoulders visible.
3. Handle incomplete portraits by combining a shaped crop with a supporting boundary such as a rectangle, rounded rectangle, parallelogram, or hexagon.
   - Use Boolean Intersect and keep a backup copy of the source image and shape.

#### Plan the Layout

- Use a two-by-two grid or a horizontal parallel layout.
- Keep the content area and gaps consistent.

#### Lay Out the Information

- Establish clear hierarchy among the name, title, honors, and experience.

#### Efficient Eye-Line Crop Workflow

1. **Create a standard portrait frame.** Insert a rectangle or rounded rectangle whose height fits between the selected guides. Duplicate it and use Align/Distribute to place all frames.
2. **Fill each fixed frame with a photo.** Use `Shape Format > Shape Fill > Picture`.
3. **Align the eye line.** Enter Crop mode, choose Fill, and drag the image inside the fixed frame until the eyes or eyebrows meet the guide.
4. **Equalize face size.** Scale the image inside the frame rather than resizing the frame, and then realign the eyes.
5. **Reuse the best crop.** Perfect one frame, duplicate it, and use Change Picture for the other people. Fine-tune only the internal image position after replacement.

### Lesson 18 — Corporate Honors and Certificates

#### Plan the Layout

1. Build a base page inside the content area.
2. Convert a plain list into visual modules.

#### Add Supporting Treatments

- For text, add an honor-related motif.
- For images, add a mockup or frame.
- When there are few items, use medal-like decoration.
- If an image and frame have different proportions, scale the image proportionally, add whitespace, and use a soft inner shadow with adjusted blur and transparency.

#### Three Certificate Layouts

1. **Parallel layout.**
2. **Mountain layout:** for an odd number of same-size images, use a low–high–low rhythm, align the lower edges, and keep gaps equal.
   - Add 3D rotation so the left certificate turns right and the right certificate turns left.
   - Add shadows and reflections near the contact area.
3. **Waterfall layout:** stagger many certificates with consistent gaps to communicate abundance.

### Lesson 19 — Organization Charts

#### Divide the Hierarchy

- Use dark/light colors, dark gray/light gray, solid/dashed lines, and shape differences to show levels.

#### Align the Nodes

- When labels have different lengths, align the shapes rather than equalizing the text width. Use one shape size large enough for the longest label.

#### Simplify Connections

- Follow symmetry and simplicity.
- Useful connector shapes include straight lines, square brackets, and braces.
- Summarize first and connect second instead of drawing a separate line from every node.

### Lesson 20 — Technical Architecture Diagrams

1. Redraw color blocks to produce clean left and right alignment.
2. Check gap consistency with a temporary square that has no outline.
3. Build hierarchy through light-dark pairing and nested shapes.

### Lesson 21 — Partner and Multi-Logo Slides

#### Find Logos

1. Official websites: accurate but limited.
2. Asset libraries: broad coverage, especially for large companies.
3. Search engines: comprehensive but inconsistent in quality.

#### Process Logos

1. Use image correction to create an approved black or white variant when appropriate.
2. Remove unwanted backgrounds.

#### Lay Out Logos

- In a parallel layout, align perceived visual weight rather than only bounding boxes.
- Add one consistent supporting shape when irregular logos need normalization.

### Lesson 22 — Chart Animation

#### Match Animation to Chart Type

1. Column chart: Stretch.
2. Line chart: Wipe.
   - For an arc, combine it with a transparent circle to change its rotation center, and then use a Wheel animation.
3. Pie chart: Wheel.

#### Animate by Category or Series

1. Add the animation.
2. Choose by series for multiple series, or by category for a single series.
3. Match the animation style to the chart.
4. Adjust the delay.

Use color contrast or a supporting background to emphasize the important series.

### Lesson 23 — Morph Transitions

[FRAME] Morph creates continuity by transforming matched elements across adjacent slides.

Supported object categories in the notes include shapes, text, images, and 3D models. Changes may involve form, dimensions, position, angle, artistic effects, 3D options, soft edges, or transparency.

**Visual description — Morph property overview:** Four vertical cards compare a rounded orange shape, orange text, a cropped photograph, and a dinosaur 3D model. Pill labels under each card list the properties that Morph can interpolate. Shared labels include size, position, angle, transparency, and 3D options, while images additionally show artistic effects and the 3D model emphasizes 3D rotation.

#### Staging Mindset

- **External offset:** with the same animation duration, a longer travel distance produces faster motion.
- **Transparent scaling:** changing the size or angle of off-slide elements can enrich the transition.

#### Two Principles

1. **Transition between equivalent objects:** elements on adjacent slides need matching types and properties.
   - For different types, replace them with the same shape or convert them to Freeform.
   - For different properties, set up the 3D rotation first, duplicate the slide, and then reset the rotation values on the new slide.
2. **Shortest-distance matching:** Morph tends to match an element with the nearest element of the same type.
   - Add a fully transparent character or rename layers to `!!1` when a forced match is needed.
   - In Effect Options, choose Words to move word groups or Characters to move individual characters.

### Lesson 24 — Rolling-Number Animation

#### Morph-and-Crop Method

1. Enter the numbers.
2. Convert them to an image.
3. Crop the image.
4. Add Morph.

#### Fly-In/Fly-Out Method

1. Stack the numbers with multiple line spacing set to `0`.
2. Add Fly In to text by word with a `50%` delay.
3. Add Fly Out upward to text by word with a `50%` delay. For ten numbers, repeat `0.9` so only the first nine fly out.
4. Constrain the visible area with a square text effect and adjust its dimensions.

### Lesson 25 — Path-Mask Animation

#### Light Sweep over Text

1. Create the mask with Boolean Subtract.
2. Keep the background layer beneath it and animate the light along a motion path.

#### Rising Water Ripple

1. Use a teardrop shape and Boolean Subtract.
2. Draw a curve or use a double-wave shape.
3. Make the start and end positions identical and disable Smooth Start and Smooth End.

### Lesson 26 — Improving a Fixed Corporate Template

- **Cover:** strengthen information contrast and interweave text with imagery.
- **Contents:** organize structure, establish hierarchy, and visualize the information.
- **Long-text slide:** convert lists into modules.
- **Timeline:** replace a straight line with a curve and give it more visual area.
- **Process:** clarify logic with symbols, numbers, or changed shapes.
- **Multi-image slide:** split long text, keep gaps and styles consistent, and use matrix alignment.
- **Image-and-text slide:** preserve a clear relationship between copy and visual.
- **Architecture slide:** use hierarchy and controlled grouping.

### Lesson 27 — Teaching and Academic Courseware

- Use heavier type so people at the back of a room can read it.
- Practice cover pages, two-section content pages, multi-section content pages, architecture diagrams, and question-type pages.

### Lesson 28 — Workplace Report Decks

- Design the cover.
- Design architecture diagrams.
- For chart slides, use a conclusion rather than a descriptive title. Keep standard labels aligned with straight or freeform line segments and apply consistent left/right alignment.
- Design tables.
- Combine images and text.

### Lesson 29 — Event-Planning Decks

- If a suitable pattern cannot be found, generate or draw one under the applicable source/permission rules.
- When a divider feels empty, enlarge the section number or a meaningful visual element.

### Lesson 30 — Quicker Plugin

[FRAME] The notes use PowerPoint plugins to reduce repetitive operations, help create effects, and apply complex animations.

### Lesson 31 — iSlide Plugin

1. **Design module:** one-click optimization for fonts, colors, guides, and paragraph consistency.
2. **Layout module:** matrix layout, image cropping, and circular layout.
3. **Design tools:** element swapping and text vectorization.
4. **Animation module:**
   - Tweening inserts intermediate shapes between two objects with different dimensions or formatting and can add animation.
   - Morph expansion creates smoother transitions.
5. **Tools module:** export features and presentation size reduction.

### Lesson 32 — OneKey/OK Plugin

1. **Shape group:** insert a full-slide rectangle or perfect circle, duplicate in place, and create progressive alignment.
2. **Color group and OK frame:** create solid-color progressions, transfer colors, and copy elements across slides.
3. **3D and graphics groups:** create ripple/cube compositions and one-click effects.
4. **Auxiliary and document groups:** special selection and separator-line tools.
