import * as path from 'path';
import * as dotenv from 'dotenv';

// Load the monorepo root .env before AppModule is evaluated.
// Some modules read process.env during module initialization,
// for example JwtModule.register.
//
// Railway injects production variables directly into process.env.
// dotenv does not override existing environment variables by default.
//
// __dirname is apps/api/src in development or apps/api/dist after compilation.
dotenv.config({
  path: path.resolve(__dirname, '../../../.env'),
});
