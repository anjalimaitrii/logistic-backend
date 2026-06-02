import { Request, Response } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import path from "path";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET!;

export const uploadFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files provided" });
      return;
    }

    const folder = (req.body.folder as string) || "job-attachments";

    const uploaded = await Promise.all(
      files.map(async (file) => {
        const ext  = path.extname(file.originalname);
        const key  = `${folder}/${randomUUID()}${ext}`;

        await s3.send(new PutObjectCommand({
          Bucket:      BUCKET,
          Key:         key,
          Body:        file.buffer,
          ContentType: file.mimetype,
        }));

        const url = `https://${BUCKET}.s3.${process.env.AWS_REGION || "ap-south-1"}.amazonaws.com/${key}`;
        return { name: file.originalname, url, size: file.size, type: file.mimetype };
      })
    );

    res.status(200).json({ success: true, files: uploaded });
  } catch (error: any) {
    console.error("[Upload]", error.message);
    res.status(500).json({ error: "File upload failed", detail: error.message });
  }
};
