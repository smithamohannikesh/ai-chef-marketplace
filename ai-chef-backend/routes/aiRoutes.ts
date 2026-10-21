import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config";
import { authenticateToken } from "./middleware/authMiddlewate";
const router= Router();
const aiRateLimit =rateLimit({
    windowMs:15*60*1000,
    limit:10,
    standardHeaders:"draft-8",
    legacyHeaders:false,
    message:{
        message:"Too many AI request.Please try again in 15 minutes"
    },
});
router.post("/suggest",authenticateToken, aiRateLimit, async(req,res)=>{
    try{
        const {ingredients}= req.body ??{};
         if (

      typeof ingredients !== "string" ||

      ingredients.trim().length === 0

    ) {

      return res.status(400).json({

        message: "Please provide ingredients",

      });

    }

    if (ingredients.length > 500) {

      return res.status(400).json({

        message: "Ingredients must not exceed 500 characters",

      });

    }
      const response = await fetch(`${config.ollamaUrl}/api/generate`, {

      method: "POST",

      headers: {

        "Content-Type": "application/json",

      },

      body: JSON.stringify({

         model: config.ollamaModel,

        prompt: `Suggest three dishes using these ingredients: ${ingredients.trim()}. Give a short description for each dish.`,

        stream: false,

      }),

      signal: AbortSignal.timeout(120000),

    });

   if (!response.ok) {

      console.error("Ollama returned status:", response.status);

      return res.status(502).json({

        message: "The AI service could not generate suggestions",

      });

    }

    const data = await response.json();

    return res.status(200).json({

      suggestions: data.response,

    });

    }catch(error){
 console.error("AI suggestion error:", error);

    return res.status(502).json({

      message: "Could not connect to the local AI service. Make sure Ollama is running.",

    });
    }
});
export default router;