# Extension Icons

The extension requires three icon sizes:
- `icon16.png` - 16x16px (toolbar)
- `icon48.png` - 48x48px (extensions page)
- `icon128.png` - 128x128px (Chrome Web Store)

## Temporary Icons

For development, you can use simple colored squares or generate icons using:

```bash
# Using ImageMagick
convert -size 16x16 xc:#667eea icon16.png
convert -size 48x48 xc:#667eea icon48.png
convert -size 128x128 xc:#667eea icon128.png

# Or add text
convert -size 128x128 xc:#667eea -pointsize 72 -fill white -gravity center -annotate +0+0 "🔍" icon128.png
```

## Design Guidelines

- Simple, recognizable symbol (🔍 magnifying glass fits the "tracker" theme)
- Use brand colors: #667eea to #764ba2 gradient
- Ensure contrast for visibility
- Test at all sizes

## Production Icons

For production, create proper PNG icons with transparency and professional design.
