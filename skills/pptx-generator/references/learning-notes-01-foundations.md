# Practical PowerPoint Learning Notes — Foundations

[KNOWN|USER] This is an English translation of the first part of the user-selected `重点笔记.md`; visual descriptions are based on the corresponding user-provided `重点笔记.pdf`. Source: user-approved harness change, 2026-07-29. The material is retained as practical notes rather than authoritative product documentation.

## PowerPoint Software Essentials

### Lesson 02 — Six Settings That Make Work More Efficient

#### How to Establish the Content Area

- Hold `Ctrl+Shift` while dragging to create a new guide.
- Default guide positions: horizontal guides at 14.5 and vertical guides at 7.5.

#### Proportional Content-Area Method

1. Use a proportionally scaled rectangle to establish the four outer boundaries.
2. Use the title height to establish the two internal horizontal boundaries.

## PowerPoint Fundamentals

### Lesson 07 — Creating a Creative Taiji Symbol

#### Boolean Operations

1. **Union and Combine:** the object selected first determines what the result becomes.
2. **Fragment:** convert overlapping areas into separate shapes.
3. **Intersect:** the opposite of Combine.
   - Select an image first and then text to fill the text with the image.
   - Crop an image into any shape.
4. **Subtract:** remove the later-selected shape together with the overlapping area.
   - Use it to create hollow text.
   - To vectorize text, insert any shape, select the text box first, select the shape second, and then apply Subtract.

### Lesson 08 — Creating Broken-Stroke Text

#### Open Paths

1. A path opens from the preceding segment based on clockwise direction.
2. A shape can be opened only once.

#### Broken-Stroke Text Procedure

1. Enter the text, remove its fill, and keep the outline.
2. Vectorize the text so it becomes a shape.
3. Open the path around the area to remove, and then delete the relevant anchor points.

### Adjusting an Image's Tone

1. For logos, set image brightness to `+100` for white or `-100` for black.
2. Set saturation to `0%` for grayscale.

#### Gradient Coloring

1. Desaturate the image to `0%`, and then crop it into a shape.
2. Adjust the gradient shape.
3. Use high image transparency, for example above `70%`.

### Creating a More Refined Text Gradient

#### Improving Gradient Colors

1. Use a linear gradient from left to right and keep only two gradient stops.
2. Initially set both stops to the same color.
3. Change one stop by adding or subtracting about 30 from its `U` value.

#### Faded Interwoven Text

1. Separate the text into independent text elements.
2. Reduce the spacing between them.
3. Give one text element `100%` transparency.

### Creating Hong Kong–Style Outlined Text

#### Three-Step Outline Effect

1. Enter the text, duplicate it several times, and place the copies behind the original.
2. Give the lower copies an outline wider than `5 pt`.
3. Select all text copies and align their horizontal and vertical centers.

### Creating a Refined Line-and-Area Combination Chart

- Use a dark color and a heavy stroke for the line chart.
- Use a lighter area chart with a top-to-bottom gradient.

### Creating Better-Looking PowerPoint Tables

#### Alignment

1. For text, use left alignment and vertical centering.
2. For numbers, use right alignment and vertical centering. If decimals are present, keep the same number of decimal places.

#### Visual Rhythm

- Alternate rows with and without fill.

#### Hierarchy

- Use larger type, colored backgrounds, and heavier rules to establish levels.

### Laying Out a Slide with a Large Amount of Text

#### Change the Fonts

1. Set the Chinese font across the deck first.
2. Then set the English font across the deck.

#### Change the Alignment

- Do not use ordinary left alignment for the noted long-form treatment.
- Use justified alignment.

#### Change the Spacing

- Smaller type needs more line spacing; about `1.2×` is sufficient.
- Larger type needs less line spacing; about `1.0×` is sufficient.

#### Adjust Column Width

- Avoid leaving a short orphaned tail at the end of a paragraph.

### Laying Out Multiple Text Sections

#### Divide the Content into Blocks

1. Divide the page along the left and right guides and keep the outer margins equal.
2. Keep gaps between color blocks equal, and make those gaps smaller than the page margins.

#### Align Information

1. Keep the alignment method consistent within every information group.
2. Use smart alignment guides instead of aligning elements by eye.

#### Increase Contrast

1. Make the title `1.5×` to `2×` the body size.
2. Contrast font weights.
3. Contrast light and dark colors.
4. Add lines.
5. Add a supporting background shape.
6. Contrast solid and transparent treatments.

### Laying Out Multiple Images

#### Image Layout

1. Keep image dimensions and gaps consistent.
2. Prefer regular image shapes.
3. For an odd number of images, keep all gaps equal, place more images on the upper row and fewer on the lower row, and center the lower group.
4. For overlaid text, add a gradient shape at the upper-left corner; for example, use a black gradient from `0%` to `100%` transparency with white text.

#### Logo Layout

1. Equalize the logos' perceived visual area rather than only their bounding-box dimensions.
2. Place irregular logos inside a consistent supporting shape.

#### Portrait Layout

1. Keep the eye line consistent.
2. Keep face sizes visually similar.

### Improving Layout Efficiency with a Formula

#### The `1+3` Method

1. When pages share the same content structure, design one sample first and then duplicate it.
2. Hold `Ctrl+Shift` while dragging with the left mouse button to duplicate quickly.
3. Press `F4` to repeat the previous operation.
4. Paste as text only when the destination paragraph formatting should be retained.

### Creating a Creative Sliding-Light Animation

- Smooth Start means slow first and fast later.
- Smooth End means fast first and slow later.

### Creating an Eye-Catching Countdown Animation

1. Use only one transition effect on a slide.
2. Keep a transition short; the note recommends less than one second.
3. Prefer subtle transitions over complex ones.

### Creating a Dynamic Team-Introduction Slide

#### When to Use Morph

- Build a dynamic visual relationship between matching elements on adjacent slides.

#### Morphable Properties by Object Type

| Object | Basic property changes | Visual/effect changes | Type-specific changes |
|---|---|---|---|
| Text | Rotation, transparency, color | Shadow, reflection, glow, 3D | Text-box fill |
| Shape | Rotation, transparency, color | Shadow, reflection, glow, 3D | Dimensions |
| Image | Rotation, transparency | Shadow, reflection, glow, 3D | Brightness, contrast, dimensions, crop |

#### Morph Principles

1. Keep the elements consistent.
2. Associate the nearest matching elements.
3. Keep object names consistent.
4. Rename a layer to `!!1` to force a transformation between two shapes.
5. Morph does not work as intended when one of the matching elements is grouped on only one slide.

**Visual description:** The source visual is a black-and-white instructional page. A four-column table compares text, shapes, and images across basic properties, visual effects, and object-specific changes. Beneath it, a numbered list summarizes the Morph rules, with bold section headings and generous white space.

### Designing a Refined Frosted-Glass Effect

1. Duplicate the background image and apply a blur value of `100`.
2. Copy the blurred image, open Format Background, choose Picture Fill, and use the clipboard image.
3. Place the unblurred image above the background, add a color block, use Slide Background Fill, and add an outline.
