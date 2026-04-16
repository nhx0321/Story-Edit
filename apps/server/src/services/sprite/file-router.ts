import { z } from 'zod';
import { router, adminProcedure } from '../../trpc';
import * as fileManager from './file-manager';

export const fileRouter = router({
  // Directory operations
  scanDirectory: adminProcedure
    .input(z.object({ basePath: z.string() }))
    .query(({ input }) => {
      return fileManager.scanDirectory(input.basePath);
    }),

  createDirectory: adminProcedure
    .input(z.object({ basePath: z.string() }))
    .mutation(({ input }) => {
      return fileManager.createDirectory(input.basePath);
    }),

  deleteDirectory: adminProcedure
    .input(z.object({ basePath: z.string(), force: z.boolean().optional().default(false) }))
    .mutation(({ input }) => {
      return fileManager.deleteDirectory(input.basePath, input.force);
    }),

  openPath: adminProcedure
    .input(z.object({ basePath: z.string() }))
    .query(({ input }) => {
      return fileManager.getOpenPath(input.basePath);
    }),

  // File scanning & preview
  scanPngs: adminProcedure
    .input(z.object({ basePath: z.string() }))
    .query(({ input }) => {
      return fileManager.scanPngs(input.basePath);
    }),

  // Manifest management
  getManifest: adminProcedure.query(() => {
    return fileManager.getManifest();
  }),

  regenerateManifest: adminProcedure.mutation(() => {
    return fileManager.regenerateManifest();
  }),

  // File upload
  uploadFile: adminProcedure
    .input(z.object({
      basePath: z.string(),
      filename: z.string(),
      base64Data: z.string(),
      mimeType: z.string(),
    }))
    .mutation(({ input }) => {
      return fileManager.uploadFile(
        input.basePath,
        input.filename,
        input.base64Data,
        input.mimeType,
      );
    }),

  // File/folder management
  rename: adminProcedure
    .input(z.object({ basePath: z.string(), newName: z.string() }))
    .mutation(({ input }) => {
      return fileManager.renamePath(input.basePath, input.newName);
    }),

  deleteFile: adminProcedure
    .input(z.object({ basePath: z.string() }))
    .mutation(({ input }) => {
      return fileManager.deleteFile(input.basePath);
    }),
});
