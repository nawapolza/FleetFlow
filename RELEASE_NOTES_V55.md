# Release Notes V55

## Mobile save fix
The close-job image is prepared when the summary opens. When the user taps **บันทึกลงมือถือ**, the system now tries these methods in order:

1. Native mobile Share Sheet with the PNG file.
2. Browser file picker when supported.
3. Full-image preview where iPhone/iPad users can long-press and choose **บันทึกรูปภาพ**.
4. Normal PNG download on desktop.

## One-screen capture
The generated receipt is now a compact 1080 × 1920 PNG. It contains:

- Job timeline steps 3, 4, and 5
- Origin and destination
- Loading and unloading weights
- Trip fee, allowance, other income, and total income
- Distance, liters, amount, price, and vehicle fuel rate
- Meter values, recorder, and photo count

## Responsive layout
The summary popup now supports mobile safe areas, dynamic viewport height, narrow screens, and short screens. Detailed fuel information and photos remain available in a collapsible section.

No database migration is required.
