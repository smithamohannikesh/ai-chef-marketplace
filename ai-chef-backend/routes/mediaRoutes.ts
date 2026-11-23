import express from "express";
import fs from "fs/promises";
import { pool } from "../db";
import { processImage } from "../services/imageService";
import { authenticateToken } from "./middleware/authMiddlewate";
import { upload } from "./middleware/upload";
const router = express.Router();
router.post("/upload", authenticateToken, upload.single("image"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            message: "No image uploaded"
        });
    }

    try {
       const { fileTypeFromFile } = await import("file-type");

const fileType = await fileTypeFromFile(req.file.path);

const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
];

if (!fileType || !allowedTypes.includes(fileType.mime)) {
    await fs.unlink(req.file.path);

    return res.status(400).json({
        message: "Invalid image file. Only JPEG, PNG and WebP are allowed."
    });
}

const processedImages = await processImage(req.file.path);
const result = await pool.query(
    `INSERT INTO media (
        original_filename,
        thumbnail_path,
        medium_path,
        large_path,
        mime_type,
        file_size,
        status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
        req.file.filename,
        processedImages.thumbnailPath,
        processedImages.mediumPath,
        processedImages.largePath,
        req.file.mimetype,
        req.file.size,
        "READY"
    ]
);
       return res.status(201).json({
    message: "Image uploaded and saved successfully",
    media: result.rows[0]
});

   } catch (error) {
    console.error("Media upload error:", error);

    return res.status(500).json({
        message: "Internal server error"
    });
}
});
export default router;
