import { prisma } from "@/lib/api/db";
import getPermission from "@/lib/api/getPermission";
import {
  UpdateCollectionSchema,
  UpdateCollectionSchemaType,
} from "@/lib/shared/schemaValidation";

export default async function updateCollection(
  userId: number,
  collectionId: number,
  body: UpdateCollectionSchemaType
) {
  console.debug(`[DEBUG] updateCollection called with userId: ${userId}, collectionId: ${collectionId}, parentId: ${body.parentId}`);

  if (!collectionId)
    return { response: "Please choose a valid collection.", status: 401 };

  const dataValidation = UpdateCollectionSchema.safeParse(body);

  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const data = dataValidation.data;

  const collectionIsAccessible = await getPermission({
    userId,
    collectionId,
  });

  console.debug(`[DEBUG] Permission check for collection: ${collectionId}`, 
    collectionIsAccessible ? 
    `ownerId: ${collectionIsAccessible.ownerId}, userCanUpdate: ${collectionIsAccessible.members.some(m => m.userId === userId && m.canUpdate)}` : 
    'No permission');

  // 사용자가 컬렉션의 소유자이거나 업데이트 권한이 있는지 확인
  const canUpdate =
    collectionIsAccessible?.ownerId === userId ||
    (collectionIsAccessible?.members && collectionIsAccessible.members.some(m => m.userId === userId && m.canUpdate));

  if (!canUpdate)
    return { response: "Collection is not accessible.", status: 401 };

  if (data.parentId) {
    if (data.parentId !== "root") {
      console.debug(`[DEBUG] Checking permissions for new parent collection: ${data.parentId}`);
      
      // 부모 컬렉션에 대한 권한 체크
      const parentPermission = await getPermission({
        userId,
        collectionId: data.parentId,
      });
      
      console.debug(`[DEBUG] Parent permission check result:`, parentPermission ? 
        `ownerId: ${parentPermission.ownerId}, canCreate: ${parentPermission.members.some(m => m.userId === userId && m.canCreate)}` : 
        'No permission');
      
      // 사용자가 부모 컬렉션에 대한 생성 권한이 있는지 확인
      const canCreateInParent = 
        parentPermission?.ownerId === userId || 
        parentPermission?.members.some(m => 
          m.userId === userId && (m.canCreate || m.canUpdate || m.canDelete)
        );
      
      // 부모 컬렉션 순환 참조 방지
      const isCircularReference = 
        typeof data.parentId !== "number" || 
        parentPermission?.parentId === data.parentId;
      
      if (!canCreateInParent || isCircularReference) {
        console.debug(`[DEBUG] User cannot create in parent collection. canCreateInParent: ${canCreateInParent}, isCircularReference: ${isCircularReference}`);
        return {
          response: "You are not authorized to create a sub-collection here.",
          status: 403,
        };
      }
      
      console.debug(`[DEBUG] User has permission to move collection to parent: ${data.parentId}`);
    }
  }

  const uniqueMembers = data.members.filter(
    (e, i, a) =>
      a.findIndex((el) => el.userId === e.userId) === i &&
      e.userId !== collectionIsAccessible.ownerId
  );
  
  console.debug(`[DEBUG] Updating collection with ${uniqueMembers.length} unique members`);

  return {
    response: await prisma.collection.update({
      where: {
        id: collectionId,
      },
      data: {
        name: data.name,
        description: data.description,
        color: data.color,
        icon: data.icon,
        iconWeight: data.iconWeight,
        isPublic: data.isPublic,
        parentId: data.parentId === "root" ? null : data.parentId,
        members: {
          deleteMany: {},
          create: uniqueMembers.map((e) => ({
            userId: e.userId,
            canCreate: e.canCreate,
            canUpdate: e.canUpdate,
            canDelete: e.canDelete,
          })),
        },
      },
      include: {
        _count: {
          select: { links: true },
        },
        members: {
          include: {
            user: {
              select: {
                username: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    }),
    status: 200,
  };
}
