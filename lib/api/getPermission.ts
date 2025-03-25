import { prisma } from "@/lib/api/db";
import { Collection as PrismaCollection, UsersAndCollections } from "@prisma/client";

// Collection 타입을 확장하여 members 필드를 포함시킵니다
type Collection = PrismaCollection & {
  members: UsersAndCollections[];
  parent?: PrismaCollection | null;
};

type Props = {
  userId: number;
  collectionId?: number;
  linkId?: number;
};

export default async function getPermission({
  userId,
  collectionId,
  linkId,
}: Props): Promise<Collection | null> {
  console.debug(`[DEBUG] getPermission called with userId: ${userId}, collectionId: ${collectionId}, linkId: ${linkId}`);
  
  if (linkId) {
    // First, get the collection containing this link
    const linkCollection = await prisma.collection.findFirst({
      where: {
        links: {
          some: {
            id: linkId,
          },
        },
      },
      include: { 
        members: true,
        parent: true 
      },
    });

    console.debug(`[DEBUG] Link collection found:`, linkCollection ? 
      `id: ${linkCollection.id}, ownerId: ${linkCollection.ownerId}, parentId: ${linkCollection.parentId}` : 'null');
    
    // If we found the collection, check permissions directly
    if (linkCollection) {
      // Check if user is owner or direct member
      const isOwner = linkCollection.ownerId === userId;
      const isDirectMember = linkCollection.members.some(m => m.userId === userId);
      
      console.debug(`[DEBUG] Permission check: isOwner: ${isOwner}, isDirectMember: ${isDirectMember}`);
      
      if (isOwner || isDirectMember) {
        console.debug(`[DEBUG] Direct permission granted for linkId: ${linkId}`);
        return linkCollection;
      }
      
      // If not a direct member, check if any parent collection grants permission
      if (linkCollection.parentId) {
        console.debug(`[DEBUG] Checking parent collection permission for linkId: ${linkId}, parentId: ${linkCollection.parentId}`);
        return getPermission({
          userId,
          collectionId: linkCollection.parentId,
        });
      }
    }
    
    console.debug(`[DEBUG] No permission found for linkId: ${linkId}`);
    return null;
  } else if (collectionId) {
    // First, check direct permission for the collection
    const collection = await prisma.collection.findFirst({
      where: {
        id: collectionId,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      include: { 
        members: true,
        parent: true
      },
    });

    console.debug(`[DEBUG] Direct collection check:`, collection ? 
      `id: ${collection.id}, ownerId: ${collection.ownerId}, parentId: ${collection.parentId}` : 'null');
    
    // If direct permission exists, return it
    if (collection) {
      console.debug(`[DEBUG] Direct permission granted for collectionId: ${collectionId}`);
      return collection;
    }
    
    // If no direct permission, check if any parent collection grants permission
    // Fetch the collection with its parent to check for inherited permissions
    const collectionWithParent = await prisma.collection.findUnique({
      where: { id: collectionId },
      include: { parent: true },
    });
    
    console.debug(`[DEBUG] Collection with parent:`, collectionWithParent ? 
      `id: ${collectionWithParent.id}, parentId: ${collectionWithParent.parentId}` : 'null');
    
    // If the collection has a parent, check permissions for the parent
    if (collectionWithParent?.parentId) {
      console.debug(`[DEBUG] Checking parent collection permission for collectionId: ${collectionId}, parentId: ${collectionWithParent.parentId}`);
      return getPermission({
        userId,
        collectionId: collectionWithParent.parentId,
      });
    }
    
    console.debug(`[DEBUG] No permission found for collectionId: ${collectionId}`);
    return null;
  }
  
  // 모든 상황을 처리한 후에도 도달하면 null 반환
  return null;
}
