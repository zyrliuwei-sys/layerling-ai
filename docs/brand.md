# Layerling AI visual identity

The brand draws on industrial drafting boards and printed parts. The mark shows a solid and its separated layer. The same SVG is used for the browser icon and product navigation.

| Role                                             | Reference                 |
| ------------------------------------------------ | ------------------------- |
| Graphite, dark background                        | `oklch(0.212 0.018 251)`  |
| Porcelain, text on graphite and light surfaces   | `oklch(0.968 0.008 96)`   |
| Signal lime, primary actions and active controls | `oklch(0.9 0.17 116)`     |
| Slate, model board                               | `oklch(0.292 0.022 251)`  |
| Interface type                                   | Geist                     |
| Headlines and wordmark                           | Barlow Semi Condensed 700 |
| Dimensions and view controls                     | Geist Mono                |

Use the signal color with a dark label on filled controls. For text links and small indicators, use the mode-aware link token. Use warm gray studio backgrounds for CAD product images and plain surfaces for reading and editing. The homepage's exploded and assembled images come from the same enclosure mesh.

The theme values live in `src/styles/globals.css`. Marketing pages and the CAD workspace both consume these tokens. The brand ships with a dark default and a matching light palette.

## Homepage imagery

Five product renders use the enclosure and bracket CAD meshes. The print preparation image for STL and 3MF shows contours sampled from the enclosure mesh. The process illustrations use ChatGPT's built-in ImageGen and are served as local WebP files.

- `public/imgs/cad/fit-measurement.webp` depicts a caliper measuring a circuit board.
- `public/imgs/cad/layer-preview.webp` depicts layer contours on a print bed.
- `public/imgs/cad/port-fit-check.webp` depicts a USB-C connector during a test fit.

### ImageGen prompts

**Measurement.** A single wide 3:2 horizontal editorial photograph for a premium CAD and 3D printing website. Real product-development bench, molded graphite-gray prototype enclosure and a small dark forest-green rectangular printed circuit board under the jaws of a brushed stainless digital caliper. Tight camera from a three-quarter overhead angle. A single engineer's hand at the upper right naturally operates the thumbwheel. The two external jaws make believable physical contact with the opposite long edges of the board. Tiny gold pads, black chips, and one USB connector visible. Macro product photography in a studio with a dark slate matte work surface, very soft daylight from left, muted graphite and porcelain tones, restrained warm undertones and one subtle chartreuse detail. Clearly legible shapes, tactile texture and selective depth of field. Place caliper jaws and board near the middle of the composition so a 3:2 crop preserves them. Keep the image free of typography, logos, borders, and watermarks.

**Test fit.** A single wide 3:2 horizontal editorial macro photograph for a premium 3D printing and CAD studio. A realistic close-up of a USB-C cable being test-fitted into one deliberately small rectangular aperture on a small cut section of an FDM-printed enclosure prototype. A hand holds the short graphite-gray 3D-printed corner coupon from behind while the connector enters the aperture from the left. Show the snug fit, clearly visible horizontal print layers at the cut edge, slight print texture and the smooth black connector shell. An out-of-focus matching enclosure body on the workbench at the far right provides scale. Industrial design desk, dark slate matte work surface, soft side light and restrained warm highlights, rich but lifted shadows, subtle foreground separation, premium macro lens look. Center the physical interaction in a 3:2 crop at surface level. Keep the image free of typography, logos, and watermarks.
