import { Router } from "express";
import { pool } from "../db";
import { broadcastChefUpdate } from "../socket";
const router =Router();
router.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM chefs");
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching chefs:", error);
        return res.status(500).json({
            message: "Internal server error",
        });
    }
});
router.post("/", async (req, res) => {

     if (typeof req.body != "object" || req.body == null || Array.isArray(req.body)) {
        return res.status(400).json({
            message: "Request body must be a JSON object",
        });
    }
    const { id, name, specialty, details, image } = req.body;
    const cleanId = id?.trim();
    const cleanName = name?.trim();
    const cleanSpecialty = specialty?.trim();

    if (
        (details !== undefined && typeof details !== "string") ||
        (image !== undefined && typeof image !== "string")
    ) {
        return res.status(400).json({
            message: "Details and image must be strings",
        });
    }

    if (
        typeof id !== "string" || !id.trim() ||
        typeof name !== "string" || !name.trim() ||
        typeof specialty !== "string" || !specialty.trim()
    ) {
        return res.status(400).json({
            message: "ID, name, and specialty must be non-empty strings",
        });
    }
    const allowedField = ["id", "name", "specialty", "details", "image"];
    const invalidFlelds = Object.keys(req.body).filter((field) => !allowedField.includes(field));
    if (invalidFlelds.length > 0) {
        return res.status(400).json({
            message: "Unsupported fields provided",
            fields: invalidFlelds
        });
    }
    try {
        const result = await pool.query("INSERT INTO chefs (id,name, specialty, details, image) VALUES ($1, $2, $3, $4,$5) RETURNING *", [cleanId, cleanName, cleanSpecialty, details, image]);
        const newchef = result.rows[0];
        await broadcastChefUpdate();
        return res.status(201).json(newchef);
    }
    catch (error: unknown) {
        console.error("Error adding new chef:", error);

        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
        ) {
            return res.status(409).json({
                message: "A chef with this ID already exists",
            });
        }

        return res.status(500).json({
            message: "Internal server error",
        });
    }
})
router.put("/:id", async (req, res) => {
    try {
         if (
            typeof req.body !== "object" ||
            req.body === null ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                message: "Request body must be a JSON object",
            });
        }
        const chefId = req.params.id;
        const { name, specialty, details, image } = req.body;

        const allowedFields = ["name", "specialty", "details", "image"];

        const invalidFields = Object.keys(req.body).filter(
            (field) => !allowedFields.includes(field)
        );

        if (invalidFields.length > 0) {
            return res.status(400).json({
                message: "Unsupported fields provided",
                fields: invalidFields,
            });
        }
        if (
            typeof name !== "string" || !name.trim() ||
            typeof specialty !== "string" || !specialty.trim()
        ) {
            return res.status(400).json({
                message: "Name and specialty must be non-empty strings",
            });
        }

        if (
            (details !== undefined && typeof details !== "string") ||
            (image !== undefined && typeof image !== "string")
        ) {
            return res.status(400).json({
                message: "Details and image must be strings",
            });
        }
        const cleanName = name?.trim();
        const cleanSpecialty = specialty?.trim();
        const cleanDetails = details?.trim();

        const result = await pool.query(
            `UPDATE chefs
       SET name = $1,
           specialty = $2,
           details = $3,
           image = $4
       WHERE id = $5
       RETURNING *`,
            [cleanName, cleanSpecialty, cleanDetails, image, chefId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Chef not found",
            });
        }

        await broadcastChefUpdate();

        return res.status(200).json(result.rows[0]);
    } catch (error:unknown) {
        console.error("Error updating chef:", error);
        return res.status(500).json({
            message: "Failed to update chef",
        });
    }
});
router.patch("/:id", async (req, res) => {
    try {
          if (
            typeof req.body !== "object" ||
            req.body === null ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                message: "Request body must be a JSON object",
            });
        }
        const { name, specialty, details, image } = req.body;

        const chefId = req.params.id;


        const allowedFields = ["name", "specialty", "details", "image"];

        const invalidFields = Object.keys(req.body).filter(
            (field) => !allowedFields.includes(field)
        );

        if (invalidFields.length > 0) {
            return res.status(400).json({
                message: "Unsupported fields provided",
                fields: invalidFields,
            });
        }
        if (
            name === undefined &&
            specialty === undefined &&
            details === undefined &&
            image === undefined
        ) {
            return res.status(400).json({
                message: "At least one field must be provided",
            });
        }
        if (
            (name !== undefined &&
                (typeof name !== "string" || !name.trim())) ||
            (specialty !== undefined &&
                (typeof specialty !== "string" || !specialty.trim())) ||
            (details !== undefined && typeof details !== "string") ||
            (image !== undefined && typeof image !== "string")
        ) {
            return res.status(400).json({
                message: "Invalid field values",
            });
        }
        const cleanName = name?.trim();
        const cleanSpecialty = specialty?.trim();
        const cleanDetails = details?.trim();
        const result = await pool.query(
            `UPDATE chefs
     SET name = COALESCE($1, name),
         specialty = COALESCE($2, specialty),
         details = COALESCE($3, details),
         image = COALESCE($4, image)
     WHERE id = $5
     RETURNING *`,
            [
                cleanName ?? null,
                cleanSpecialty ?? null,
                cleanDetails ?? null,
                image ?? null,
                chefId,
            ]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Chef not found",
            });
        }

        await broadcastChefUpdate();

        return res.status(200).json(result.rows[0]);
    } catch (error: unknown) {
        console.error("Error partially updating chef:", error);
        return res.status(500).json({
            message: "Internal server error",
        });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        const chefId = req.params.id;

       const result = await pool.query(
            "DELETE FROM chefs WHERE id = $1 RETURNING *",
            [chefId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Chef not found" });
        }

        await broadcastChefUpdate();

        return res.status(200).json({
            message: "Chef deleted successfully",
            chef: result.rows[0],
        });
    }
catch (error: unknown) {
    console.error("Error deleting chef:", error);

    return res.status(500).json({
        message: "Internal server error",
    });
}

});
export default router;
