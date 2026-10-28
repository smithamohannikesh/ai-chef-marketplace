import bcrypt from "bcrypt";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db";
const router = Router();
router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validate required fields

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            !name.trim() ||
            !email.trim() ||
            !password
        ) {

            return res.status(400).json({
                message: "Name, email, and password are required",
            });

        }
        const normalizedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!emailPattern.test(normalizedEmail)) {
  return res.status(400).json({
    message: "Please enter a valid email address",
  });
}
        if (normalizedName.length > 100 || normalizedEmail.length > 255) {

            return res.status(400).json({

                message: "Name or email is too long",

            });

        }


        if (password.length < 8) {

            return res.status(400).json({

                message: "Password must be at least 8 characters long",

            });

        }

        // Check whether the email is already registered

        const existingUser = await pool.query(

            "SELECT id FROM users WHERE email = $1",

            [normalizedEmail]

        );

        if (existingUser.rows.length > 0) {

            return res.status(409).json({

                message: "Email is already registered",

            });

        }

        // Hash the password before saving it

        const passwordHash = await bcrypt.hash(password, 12);


        const result = await pool.query(

            `INSERT INTO users (name, email, password_hash)

       VALUES ($1, $2, $3)

       RETURNING id, name, email, created_at`,

            [normalizedName, normalizedEmail, passwordHash]

        );
        return res.status(201).json({
            message: "User registered successfully",
            user: result.rows[0],
        });
    }
    catch (error) {
        console.error("Registration error:", error);
        return res.status(500).json({
            message: "Unable to register user",
        })
    }

});

//login endpoint
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body ?? {};
        if (
            typeof email !== "string" || typeof password !== "string" || !email.trim() || !password
        ) {
            return res.status(400).json({ message: "Email and Password required" });
        }
        const normalizedEmail = email.trim().toLocaleLowerCase();
        const result = await pool.query("SELECT id,name,email,password_hash FROM users WHERE email=$1", [normalizedEmail]);
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password",
            })
        }
        const passwordMatches = await bcrypt.compare(
            password, user.password_hash
        );
        if (!passwordMatches) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }
        const secret = process.env.JWT_SECRET;
        if (!secret || secret === "replace_this_with_a_long_random_secret") {
            console.error("JWT_SECRET is missing or still uses the placeholder");
            return res.status(500).json({
                message: "Authentication is not configuered",
            });
        }
        const token = jwt.sign(
            { userId: user.id },
            secret,
            { expiresIn: "1h" }

        );
        const refreshToken = jwt.sign(
    { userId: user.id, type: "refresh" },
    secret,
    { expiresIn: "7d" }
);
        return res.status(200).json({

            message: "Login successful",

            token,
            refreshToken,

            user: {

                id: user.id,

                name: user.name,

                email: user.email,

            },

        });
    }
    catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({

            message: "Unable to log in",

        });


    }

}

)
router.post("/refresh", (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(401).json({
            message: "Refresh token is required",
        });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
        return res.status(500).json({
            message: "Authentication is not configured",
        });
    }

    try {
        const decoded = jwt.verify(refreshToken, secret);

        if (
            typeof decoded === "string" ||
            !("userId" in decoded) ||
            decoded.type !== "refresh"
        ) {
            return res.status(401).json({
                message: "Invalid refresh token",
            });
        }

        const token = jwt.sign(
            { userId: decoded.userId },
            secret,
            { expiresIn: "1h" }
        );

        return res.status(200).json({
            message: "Access token refreshed successfully",
            token,
        });
    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired refresh token",
        });
    }
});
export default router;