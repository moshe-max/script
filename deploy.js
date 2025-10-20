const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

async function deploy() {
  try {
    const auth = new google.auth.OAuth2({
      clientId: process.env.OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/oauth2callback"
    });
    auth.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });

    const script = google.script({ version: "v1", auth });
    const projectId = process.env.GAS_PROJECT_ID;

    if (!projectId) {
      throw new Error("GAS_PROJECT_ID environment variable is not set");
    }

    const srcDir = "./src";
    const files = fs.readdirSync(srcDir).map(f => {
      const filePath = path.join(srcDir, f);
      return {
        name: f === "appsscript.json" ? "appsscript" : path.parse(f).name,
        type: f === "appsscript.json" ? "JSON" : "SERVER_JS",
        source: fs.readFileSync(filePath, "utf-8")
      };
    });

    if (!files.some(f => f.name === "appsscript")) {
      throw new Error("appsscript.json is missing in src/ directory");
    }

    console.log(`Deploying to project: ${projectId}`);
    const response = await script.projects.updateContent({
      scriptId: projectId,
      requestBody: { files }
    });

    console.log("Deployment complete!", response.data);
  } catch (error) {
    console.error("Deployment failed:", error.message);
    process.exit(1);
  }
}

deploy();