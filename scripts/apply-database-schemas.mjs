import { MongoClient } from "mongodb";
import { collectionSchemas, schemaCollectionNames } from "../lib/mongo-schemas.mjs";

const apply = process.argv.includes("--apply");
const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) throw new Error("MONGO_URL is required. Load it from your local environment.");

const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 8_000 });
try {
  await client.connect();
  const database = client.db("chat_application");
  const known = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name),
  );
  const results = [];
  for (const name of schemaCollectionNames) {
    if (!known.has(name)) {
      results.push({ name, count: 0, invalid: 0, missing: true });
      continue;
    }
    const invalid = await database
      .collection(name)
      .countDocuments({ $nor: [{ $jsonSchema: collectionSchemas[name] }] });
    const count = await database.collection(name).countDocuments();
    results.push({ name, count, invalid, missing: false });
  }
  for (const result of results) {
    console.log(
      `${result.name}: ${result.missing ? "will create" : `${result.count} documents, ${result.invalid} invalid`}`,
    );
  }
  if (!apply) {
    console.log(
      "Dry run only. Review results, then run npm run db:schema:apply to enforce these validators.",
    );
    if (results.some((result) => result.invalid)) process.exitCode = 2;
  } else if (results.some((result) => result.invalid)) {
    throw new Error(
      "No validators applied: fix or explicitly migrate invalid existing documents, then retry.",
    );
  } else {
    for (const result of results) {
      const validator = { $jsonSchema: collectionSchemas[result.name] };
      if (result.missing)
        await database.createCollection(result.name, {
          validator,
          validationLevel: "moderate",
          validationAction: "error",
        });
      else
        await database.command({
          collMod: result.name,
          validator,
          validationLevel: "moderate",
          validationAction: "error",
        });
    }
    console.log("MongoDB schema validators are now enforced.");
  }
} finally {
  await client.close();
}
