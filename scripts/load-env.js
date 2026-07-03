const dotenv = require("dotenv");

// Load environment variables from .env.local or .env.development.local
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development.local" });
