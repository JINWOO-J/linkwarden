import { prisma } from "@/lib/api/db";
import createFolder from "@/lib/api/storage/createFolder";
import getPermission from "@/lib/api/getPermission";
import {
  PostCollectionSchema,
  PostCollectionSchemaType,
} from "@/lib/shared/schemaValidation";

export default async function postCollection(
  body: PostCollectionSchemaType,
  userId: number
) {
  console.debug(`[DEBUG] postCollection called with userId: ${userId}, parentId: ${body.parentId}`);
  
  const dataValidation = PostCollectionSchema.safeParse(body);

  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const collection = dataValidation.data;

  if (collection.parentId) {
    console.debug(`[DEBUG] Checking permissions for parent collection: ${collection.parentId}`);
    
    // getPermission 함수를 사용하여 상속된 권한을 포함한 권한 확인
    const permission = await getPermission({
      userId,
      collectionId: collection.parentId,
    });

    console.debug(`[DEBUG] Permission check result:`, permission ? 
      `ownerId: ${permission.ownerId}, userId: ${userId}, canCreate: ${permission.members.some(m => m.userId === userId && m.canCreate)}` : 
      'No permission');

    // 사용자가 컬렉션 소유자이거나, 직접 또는 상속된 canCreate/canUpdate/canDelete 권한이 있는지 확인
    const canCreate = 
      permission?.ownerId === userId || 
      permission?.members.some(m => 
        m.userId === userId && (m.canCreate || m.canUpdate || m.canDelete)
      );
    
    if (!canCreate || typeof collection.parentId !== "number") {
      console.debug(`[DEBUG] User does not have permission to create subcollection. canCreate: ${canCreate}`);
      return {
        response: "You are not authorized to create a sub-collection here.",
        status: 403,
      };
    }
    
    console.debug(`[DEBUG] User has permission to create subcollection in collection ${collection.parentId}`);
  }

  const newCollection = await prisma.collection.create({
    data: {
      name: collection.name.trim(),
      description: collection.description,
      color: collection.color,
      icon: collection.icon,
      iconWeight: collection.iconWeight,
      parent: collection.parentId
        ? {
            connect: {
              id: collection.parentId,
            },
          }
        : undefined,
      owner: {
        connect: {
          id: userId,
        },
      },
      createdBy: {
        connect: {
          id: userId,
        },
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
            },
          },
        },
      },
    },
  });

  console.debug(`[DEBUG] Created new collection: ${newCollection.id}, parent: ${newCollection.parentId}`);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      collectionOrder: {
        push: newCollection.id,
      },
    },
  });

  createFolder({ filePath: `archives/${newCollection.id}` });

  return { response: newCollection, status: 200 };
}
