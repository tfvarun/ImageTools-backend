# Image Conversion Web Application

A full-stack web application for converting, resizing, and cropping images with support for multiple formats.

## Features

### Image Conversion
- PNG to JPEG
- JPEG to PNG
- WebP to PNG
- JFIF to PNG
- PNG to SVG
- HEIC to JPG
- HEIC to PNG
- Universal Image Converter (shows all available conversion options based on uploaded file)

### Image Resizing
- PNG Resizer
- JPG Resizer
- WebP Resizer
- Bulk Resizer (multiple files at once)

### Image Cropping
- PNG Crop
- JPG Crop
- WebP Crop
- Universal Crop (all formats)

## Technology Stack

- **Backend**: Node.js, Express.js
- **Frontend**: React.js
- **Image Processing**: Sharp
- **File Upload**: Multer

## Installation

1. Install backend dependencies:
```bash
npm install
```

2. Install frontend dependencies:
```bash
npm run install-client
```

## Running the Application

### Development Mode

Start the backend server:
```bash
npm run dev
```

In a separate terminal, start the frontend:
```bash
npm run client
```

The application will be available at `http://localhost:3000`

### Production Mode

Build the frontend:
```bash
npm run build
```

Start the server:
```bash
npm start
```

## API Endpoints

- `POST /api/convert` - Convert image to different format
- `POST /api/resize` - Resize single image
- `POST /api/bulk-resize` - Resize multiple images
- `POST /api/crop` - Crop image
- `POST /api/get-conversion-options` - Get available conversion formats for uploaded file

## Color Theme

- Primary: #778873
- Secondary: #A1BC98
- Accent: #D2DCB6
- Background: #F1F3E0





