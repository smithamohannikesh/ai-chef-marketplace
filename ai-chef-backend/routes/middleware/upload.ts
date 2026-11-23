import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },

    filename: (req, file, cb) => {
        const uniqueName =
            `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

        cb(null, uniqueName + path.extname(file.originalname));
    }
});

const fileFilter: multer.Options["fileFilter"] = (
    req,
    file,
    cb
) => {
    // if (file.mimetype.startsWith("image/")) {
    //     cb(null, true);
    // } else {
    //     cb(new Error("Only image files are allowed"));
    // }
    const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
];

if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
} else {
   cb(null, false);
}
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});