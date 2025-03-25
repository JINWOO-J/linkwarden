import { prisma } from "@/lib/api/db";
import { Member } from "@/types/global";

export default async function getCollectionById(
  userId: number,
  collectionId: number
) {
  console.debug(`[DEBUG] getCollectionById called for userId: ${userId}, collectionId: ${collectionId}`);
  
  // 1. 기본 컬렉션 정보 가져오기
  const collection = await prisma.collection.findFirst({
    where: {
      id: collectionId,
    },
    include: {
      _count: {
        select: { links: true },
      },
      parent: true,
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              image: true,
              email: true,
            },
          },
        },
      },
    },
  });
  
  if (!collection) {
    console.debug(`[DEBUG] Collection not found: ${collectionId}`);
    return { response: null, status: 404 };
  }
  
  console.debug(`[DEBUG] Collection found: id: ${collection.id}, name: ${collection.name}, parentId: ${collection.parentId}`);
  
  // 2. 사용자가 이 컬렉션에 직접 액세스할 수 있는지 확인
  const hasDirectAccess = 
    collection.ownerId === userId || 
    collection.members.some(m => m.userId === userId);
  
  console.debug(`[DEBUG] User has direct access: ${hasDirectAccess}`);
  
  // 3. 상위 컬렉션 체인에서 모든 상속된 멤버 가져오기
  let inheritedMembers: Member[] = [];
  
  if (collection.parentId) {
    console.debug(`[DEBUG] Checking parent collection for inherited members: ${collection.parentId}`);
    
    // 재귀적으로 모든 상위 컬렉션의 멤버 가져오기
    const getParentMembersRecursive = async (parentId: number): Promise<Member[]> => {
      const parentCollection = await prisma.collection.findUnique({
        where: { id: parentId },
        include: {
          parent: true,
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  image: true,
                  email: true,
                },
              },
            },
          },
        },
      });
      
      if (!parentCollection) return [];
      
      console.debug(`[DEBUG] Parent collection found: id: ${parentCollection.id}, name: ${parentCollection.name}, members: ${parentCollection.members.length}`);
      
      // 현재 상위 컬렉션의 멤버 가져오기
      const parentMembers: Member[] = parentCollection.members.map(member => ({
        ...member,
        inherited: true,
        inheritedFromCollectionId: parentCollection.id,
        inheritedFromCollectionName: parentCollection.name,
      }));
      
      parentMembers.forEach(member => {
        console.debug(`[DEBUG] Inherited member from collection ${parentCollection.name}: user ${member.user.username}, role: ${member.canCreate && member.canUpdate && member.canDelete ? 'admin' : member.canCreate ? 'contributor' : 'viewer'}`);
      });
      
      // 더 상위 컬렉션이 있으면 재귀적으로 멤버 가져오기
      const grandParentMembers: Member[] = parentCollection.parentId 
        ? await getParentMembersRecursive(parentCollection.parentId)
        : [];
        
      return [...parentMembers, ...grandParentMembers];
    };
    
    inheritedMembers = await getParentMembersRecursive(collection.parentId);
    console.debug(`[DEBUG] Total inherited members found: ${inheritedMembers.length}`);
  }
  
  // 4. 모든 멤버 결합 (직접 멤버 + 상속된 멤버)
  const allMembers = [...collection.members, ...inheritedMembers];
  console.debug(`[DEBUG] All members for collection ${collection.name}: Direct: ${collection.members.length}, Inherited: ${inheritedMembers.length}, Total: ${allMembers.length}`);
  
  // 사용자가 상속된 권한으로 액세스할 수 있는지 확인
  const hasInheritedAccess = inheritedMembers.some(m => m.userId === userId);
  console.debug(`[DEBUG] User has inherited access: ${hasInheritedAccess}`);
  
  // 사용자가 컬렉션에 액세스할 수 없으면 404 반환
  if (!hasDirectAccess && !hasInheritedAccess && collection.ownerId !== userId) {
    console.debug(`[DEBUG] User has no access to collection`);
    return { response: null, status: 404 };
  }
  
  // 5. 응답 객체 구성
  const responseCollection = {
    ...collection,
    members: allMembers,
    hasInheritedMembers: inheritedMembers.length > 0,
  };

  return { response: responseCollection, status: 200 };
}
