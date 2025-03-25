import { prisma } from "@/lib/api/db";
import { Collection } from "@prisma/client";

export default async function getCollection(userId: number) {
  console.debug(`[DEBUG] getCollections called for userId: ${userId}`);
  
  // 1. 사용자가 직접 소유하거나 멤버인 컬렉션 가져오기
  const directCollections = await prisma.collection.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    },
    include: {
      _count: {
        select: { links: true },
      },
      parent: {
        select: {
          id: true,
          name: true,
        },
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
      subCollections: {
        select: {
          id: true
        }
      }
    },
  });
  
  console.debug(`[DEBUG] Direct collections found: ${directCollections.length}`);
  directCollections.forEach(c => 
    console.debug(`[DEBUG] Direct collection: id: ${c.id}, name: ${c.name}, parentId: ${c.parentId}, subCollections: ${c.subCollections.length}`)
  );
  
  // 2. 직접 접근 권한이 있는 컬렉션의 모든 하위 컬렉션 가져오기
  const allCollectionIds = new Set<number>();
  directCollections.forEach(c => allCollectionIds.add(c.id));
  
  const getAllSubCollections = async (parentIds: number[]): Promise<any[]> => {
    if (parentIds.length === 0) return [];
    
    const parentCollectionsMap = new Map();
    for (const id of parentIds) {
      const parentCollection = directCollections.find(c => c.id === id) || 
                              (await prisma.collection.findUnique({
                                where: { id },
                                include: {
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
                                }
                              }));
      if (parentCollection) {
        parentCollectionsMap.set(id, parentCollection);
      }
    }
    
    console.debug(`[DEBUG] Parent collections for inheritance: ${Array.from(parentCollectionsMap.keys()).join(', ')}`);
    
    const subCollections = await prisma.collection.findMany({
      where: {
        parentId: {
          in: parentIds
        }
      },
      include: {
        _count: {
          select: { links: true },
        },
        parent: {
          select: {
            id: true,
            name: true,
          },
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
    });
    
    console.debug(`[DEBUG] Found ${subCollections.length} sub-collections for parents: ${parentIds.join(', ')}`);
    
    // 각 하위 컬렉션에 대해 상속된 멤버 추가
    const processedSubCollections = subCollections.map(subCollection => {
      const parentCollection = parentCollectionsMap.get(subCollection.parentId);
      
      if (!parentCollection) {
        return subCollection;
      }
      
      console.debug(`[DEBUG] Processing sub-collection: ${subCollection.id} (${subCollection.name}) - parent: ${subCollection.parentId} (${parentCollection.name})`);
      
      // 상위 컬렉션의 멤버 정보를 상속 멤버로 추가
      const inheritedMembers = parentCollection.members.map((member: any) => ({
        ...member,
        inherited: true,
        inheritedFromCollectionId: parentCollection.id,
        inheritedFromCollectionName: parentCollection.name
      }));
      
      console.debug(`[DEBUG] Adding ${inheritedMembers.length} inherited members to collection ${subCollection.id}`);
      inheritedMembers.forEach((member: any) => {
        console.debug(`[DEBUG] Inherited member: userId: ${member.userId}, username: ${member.user.username}, canCreate: ${member.canCreate}, canUpdate: ${member.canUpdate}, canDelete: ${member.canDelete}`);
      });
      
      // 기존 멤버와 상속된 멤버 합치기
      const allMembers = [...subCollection.members];
      
      // 이미 직접 멤버인 사용자와 중복되지 않는 경우에만 상속된 멤버 추가
      inheritedMembers.forEach((inheritedMember: any) => {
        const existingMemberIndex = allMembers.findIndex(m => m.userId === inheritedMember.userId);
        
        if (existingMemberIndex === -1) {
          // 직접 멤버가 아닌 경우 상속된 멤버 추가
          allMembers.push(inheritedMember);
          console.debug(`[DEBUG] Added inherited member: userId: ${inheritedMember.userId} to collection ${subCollection.id}`);
        } else {
          console.debug(`[DEBUG] User ${inheritedMember.userId} already exists as a direct member - not adding inherited permissions`);
        }
      });
      
      return {
        ...subCollection,
        members: allMembers,
        hasInheritedMembers: inheritedMembers.length > 0
      };
    });
    
    const newParentIds: number[] = [];
    // 이미 처리한 컬렉션 ID만 필터링
    const uniqueSubCollections = processedSubCollections.filter(c => {
      if (allCollectionIds.has(c.id)) {
        console.debug(`[DEBUG] 중복 감지: 컬렉션 ID ${c.id} (${c.name})는 이미 처리되었습니다`);
        return false;
      }
      
      allCollectionIds.add(c.id);
      newParentIds.push(c.id);
      return true;
    });
    
    console.debug(`[DEBUG] Found ${uniqueSubCollections.length} unique sub-collections (removed ${processedSubCollections.length - uniqueSubCollections.length} duplicates)`);
    
    // 재귀적으로 하위 컬렉션의 하위 컬렉션 가져오기
    const deeperSubCollections = await getAllSubCollections(newParentIds);
    
    return [...uniqueSubCollections, ...deeperSubCollections];
  };
  
  const directCollectionIds = directCollections.map(c => c.id);
  const subCollections = await getAllSubCollections(directCollectionIds);
  
  console.debug(`[DEBUG] Sub-collections found: ${subCollections.length}`);
  subCollections.forEach(c => 
    console.debug(`[DEBUG] Sub-collection: id: ${c.id}, name: ${c.name}, parentId: ${c.parentId}`)
  );
  
  // 3. 모든 컬렉션 합치기
  const allCollections = [...directCollections, ...subCollections];
  
  console.debug(`[DEBUG] Total collections returned: ${allCollections.length}`);
  
  return { response: allCollections, status: 200 };
}
