import { prisma } from "@/lib/api/db";
import getScreenshotFromURL from "@/lib/puppeteer/getScreenshotFromURL";
import getArchiveFromURL from "@/lib/puppeteer/getArchiveFromURL";
import getPDFFromURL from "@/lib/puppeteer/getPDFFromURL";
import isUrlValid from "@/lib/api/isUrlValid";
import getPermission from "@/lib/api/getPermission";
import {
  PostLinkSchema,
  PostLinkSchemaType,
} from "@/lib/shared/schemaValidation";

export default async function createLink(body: PostLinkSchemaType, userId: number) {
  console.debug(`[DEBUG] createLink called with userId: ${userId}, collectionId: ${body.collectionId}`);

  const dataValidation = PostLinkSchema.safeParse(body);

  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  let link = dataValidation.data;

  if (link.collectionId) {
    console.debug(`[DEBUG] 링크를 위한 컬렉션 권한 확인: ${link.collectionId}`);

    // 사용자가 이 컬렉션에 링크를 추가할 권한이 있는지 확인
    const collectionPermission = await getPermission({
      userId,
      collectionId: link.collectionId,
    });

    console.debug(`[DEBUG] 컬렉션 권한 확인 결과:`, collectionPermission ? 
      `ownerId: ${collectionPermission.ownerId}, canCreate: ${collectionPermission.members.some(m => m.userId === userId && m.canCreate)}` : 
      'No permission');

    // 소유자이거나 canCreate, canUpdate, canDelete 권한이 있는지 확인
    const canAddLink = 
      collectionPermission?.ownerId === userId || 
      collectionPermission?.members.some(m => 
        m.userId === userId && (m.canCreate || m.canUpdate || m.canDelete)
      );

    if (!canAddLink) {
      console.debug(`[DEBUG] 사용자가 링크 생성 권한이 없음`);
      return {
        response: "You are not authorized to add links to this collection.",
        status: 403,
      };
    }
  }

  // 나머지 링크 생성 로직...
} 