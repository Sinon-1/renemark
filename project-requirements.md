# Project Requirements: Renemark

## Overview
**Renemark** is a web-based application designed for adding custom watermarks to pictures. It features batch/bundle processing capabilities, allowing users to apply watermarks to multiple images simultaneously with high precision and flexibility.

---

## Core Features

1. **Watermark Engine**
   - **Image-based Watermarking**: Supports uploading a primary watermark image (ideally with a removed/transparent background, e.g., PNG).
   - **Customization & Positioning**: Controls for scaling, opacity, rotation, and positioning (corners, center, or custom drag-and-drop placement).
   - **Live Preview**: Real-time canvas/DOM preview of the watermark applied to sample images.

2. **Bundle/Batch Processing**
   - Multi-file image upload (drag-and-drop support for bulk selection).
   - Apply identical watermark settings across the entire batch with a single click.
   - Bulk export/download (as a ZIP archive or individual downloads).

3. **User Authentication & Cloud Storage (Supabase)**
   - Secure user sign-up and login via Supabase Auth.
   - Save custom watermark presets and templates to Supabase Database.
   - Optional cloud storage for watermark assets and project history.

---

## Tech Stack

- **Frontend**: React (Vite)
- **Language**: TypeScript
- **UI Components**: Tailwind CSS + Shadcn UI
- **Backend / Database**: Supabase (Auth, PostgreSQL, Storage)
- **Export/Processing**: HTML5 Canvas / JSZip for bundle downloads

---

## UI/UX & Responsiveness

- Fully responsive layout optimized for desktop, tablet, and mobile devices.
- Mobile-friendly interface allowing users to upload, configure, and download watermarked photos on the go.
- Clean, modern dark/light mode aesthetic built with Tailwind CSS and Shadcn components.
