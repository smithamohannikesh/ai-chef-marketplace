import path from "path";
import sharp from "sharp";

export const processImage = async (inputPath: string) => {
    const outputDir = path.dirname(inputPath);
    const filename = path.parse(inputPath).name;

    const thumbnailPath = path.join(
        outputDir,
        `${filename}-thumb.jpg`
    );

    const mediumPath = path.join(
        outputDir,
        `${filename}-medium.jpg`
    );

    const largePath = path.join(
        outputDir,
        `${filename}-large.jpg`
    );

    await Promise.all([
        sharp(inputPath)
            .resize(150, 150, { fit: "cover" })
            .jpeg({ quality: 70 })
            .toFile(thumbnailPath),

        sharp(inputPath)
            .resize({ width: 600, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(mediumPath),

        sharp(inputPath)
            .resize({ width: 1200, withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toFile(largePath)
    ]);

    return {
        thumbnailPath,
        mediumPath,
        largePath
    };
};