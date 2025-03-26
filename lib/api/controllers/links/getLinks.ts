import { prisma } from "@/lib/api/db";
import { LinkRequestQuery, Order, Sort } from "@/types/global";
import getPermission from "@/lib/api/getPermission";

// 재귀적으로 하위 컬렉션 ID 찾기 - getCollections.ts와 유사한 방식
const getAllSubCollectionIds = (parentId: number | null, collections: any[], processedIds: Set<number> = new Set()): number[] => {
  const directSubCollections = collections
    .filter(c => c.parentId === parentId && !processedIds.has(c.id))
    .map(c => c.id);
    
  let result = [...directSubCollections];
  
  // 처리된 ID 추적
  directSubCollections.forEach(id => processedIds.add(id));
  
  // 각 직계 하위 컬렉션에 대해 재귀적으로 그 하위 컬렉션들의 ID 가져오기
  for (const subCollectionId of directSubCollections) {
    const deeperSubCollections = getAllSubCollectionIds(subCollectionId, collections, processedIds);
    result = [...result, ...deeperSubCollections];
  }
  
  return result;
};

export default async function getLink(userId: number, query: LinkRequestQuery) {
  console.debug(`[DEBUG] getLinks called for userId: ${userId}, collectionId: ${query.collectionId}`);
  
  const POSTGRES_IS_ENABLED =
    process.env.DATABASE_URL?.startsWith("postgresql");

  let order: Order = { id: "desc" };
  if (query.sort === Sort.DateNewestFirst) order = { id: "desc" };
  else if (query.sort === Sort.DateOldestFirst) order = { id: "asc" };
  else if (query.sort === Sort.NameAZ) order = { name: "asc" };
  else if (query.sort === Sort.NameZA) order = { name: "desc" };
  else if (query.sort === Sort.DescriptionAZ) order = { description: "asc" };
  else if (query.sort === Sort.DescriptionZA) order = { description: "desc" };

  const searchConditions = [];

  if (query.searchQueryString) {
    if (query.searchByName) {
      searchConditions.push({
        name: {
          contains: query.searchQueryString,
          mode: POSTGRES_IS_ENABLED ? "insensitive" : undefined,
        },
      });
    }

    if (query.searchByUrl) {
      searchConditions.push({
        url: {
          contains: query.searchQueryString,
          mode: POSTGRES_IS_ENABLED ? "insensitive" : undefined,
        },
      });
    }

    if (query.searchByDescription) {
      searchConditions.push({
        description: {
          contains: query.searchQueryString,
          mode: POSTGRES_IS_ENABLED ? "insensitive" : undefined,
        },
      });
    }

    if (query.searchByTextContent) {
      searchConditions.push({
        textContent: {
          contains: query.searchQueryString,
          mode: POSTGRES_IS_ENABLED ? "insensitive" : undefined,
        },
      });
    }

    if (query.searchByTags) {
      searchConditions.push({
        tags: {
          some: {
            name: {
              contains: query.searchQueryString,
              mode: POSTGRES_IS_ENABLED ? "insensitive" : undefined,
            },
            OR: [
              { ownerId: userId },
              {
                links: {
                  some: {
                    collection: {
                      members: {
                        some: { userId },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      });
    }
  }

  const tagCondition = [];

  if (query.tagId) {
    tagCondition.push({
      tags: {
        some: {
          id: query.tagId,
        },
      },
    });
  }

  let collectionsToInclude: number[] = [];

  // 특정 컬렉션 ID가 주어졌을 때
  if (query.collectionId) {
    console.debug(`[DEBUG] 컬렉션 ID: ${query.collectionId}에 대한 링크 검색 시작`);
    
    // 컬렉션 존재 여부 확인
    const collectionExists = await prisma.collection.findUnique({
      where: { id: query.collectionId },
      select: { id: true, name: true, parentId: true }
    });
    
    console.debug(`[DEBUG] 컬렉션 존재 여부: ${collectionExists ? '존재함' : '존재하지 않음'}`);
    
    if (!collectionExists) {
      console.debug(`[DEBUG] 컬렉션 ${query.collectionId}이(가) 존재하지 않아 빈 결과 반환`);
      return { response: [], status: 200 };
    }
    
    const hasPermission = await getPermission({
      userId,
      collectionId: query.collectionId,
    });
    
    console.debug(`[DEBUG] 권한 확인 결과:`, hasPermission);
    
    if (!hasPermission) {
      console.debug(`[DEBUG] 컬렉션 ${query.collectionId}에 대한 접근 권한이 없어 빈 결과 반환`);
      return { response: [], status: 200 };
    }
    
    try {
      // 모든 컬렉션 가져오기 (계층 구조 파악)
      const allCollections = await prisma.collection.findMany({
        select: { id: true, parentId: true, name: true }
      });
      
      console.debug(`[DEBUG] 전체 컬렉션 수: ${allCollections.length}`);
      
      // 컬렉션 계층 구조 로깅
      console.debug(`[DEBUG] 컬렉션 계층 구조:`);
      allCollections.forEach(c => {
        console.debug(`[DEBUG] - ID: ${c.id}, 이름: ${c.name}, 부모ID: ${c.parentId || 'root'}`);
      });
      
      // 주어진 컬렉션 ID를 배열에 추가
      collectionsToInclude.push(query.collectionId);
      
      // 하위 컬렉션 ID 찾기 (중복 방지를 위한 Set 사용)
      const processedIds = new Set<number>([query.collectionId]);
      
      // 하위 컬렉션 ID를 찾을 때 로깅 추가
      console.debug(`[DEBUG] ${query.collectionId} 컬렉션의 하위 컬렉션 검색 시작...`);
      console.debug(`[DEBUG] 검색 대상 컬렉션 수: ${allCollections.length}`);
      
      const subCollectionIds = getAllSubCollectionIds(query.collectionId, allCollections, processedIds);
      
      console.debug(`[DEBUG] 발견된 하위 컬렉션 수: ${subCollectionIds.length}`);
      if (subCollectionIds.length > 0) {
        console.debug(`[DEBUG] 하위 컬렉션 ID: ${subCollectionIds.join(', ')}`);
        
        // 하위 컬렉션 이름 로깅 (디버깅 용이)
        const subCollectionNames = allCollections
          .filter(c => subCollectionIds.includes(c.id))
          .map(c => `${c.id}:${c.name}`);
        console.debug(`[DEBUG] 하위 컬렉션 정보: ${subCollectionNames.join(', ')}`);
      } else {
        console.debug(`[DEBUG] 하위 컬렉션을 찾지 못했습니다. 원인 확인 필요!`);
        
        // 직접 하위 컬렉션 찾기를 시도해보기
        const directChildren = allCollections.filter(c => c.parentId === query.collectionId);
        console.debug(`[DEBUG] 직접 쿼리로 찾은 하위 컬렉션 수: ${directChildren.length}`);
        directChildren.forEach(c => {
          console.debug(`[DEBUG] - 직접 하위: ID: ${c.id}, 이름: ${c.name}`);
        });
      }
      
      // 모든 하위 컬렉션 ID 추가
      collectionsToInclude = [...collectionsToInclude, ...subCollectionIds];
      
      console.debug(`[DEBUG] 컬렉션 ID 포함 목록 (최종): ${collectionsToInclude.join(', ')}`);
    } catch (error) {
      console.error(`[ERROR] 하위 컬렉션 검색 중 오류 발생:`, error);
    }
    
  } else {
    // 특정 컬렉션이 지정되지 않은 경우, 사용자가 접근 가능한 모든 컬렉션 검색
    try {
      // 사용자가 접근 가능한 모든 컬렉션 가져오기
      const accessibleCollections = await prisma.collection.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } }
          ]
        },
        select: { id: true, parentId: true, name: true }
      });
      
      console.debug(`[DEBUG] 사용자가 접근 가능한 컬렉션 수: ${accessibleCollections.length}`);
      
      // 모든 컬렉션 가져오기 (하위 컬렉션 검색에 필요)
      const allCollections = await prisma.collection.findMany({
        select: { id: true, parentId: true, name: true }
      });
      
      console.debug(`[DEBUG] 전체 컬렉션 수: ${allCollections.length}`);
      
      // 기본적으로 접근 가능한 컬렉션 ID 추가
      const directAccessIds = accessibleCollections.map(c => c.id);
      console.debug(`[DEBUG] 직접 접근 가능한 컬렉션 수: ${directAccessIds.length}`);
      
      // 중복 방지용 Set
      const processedIds = new Set<number>();
      let allIncludedIds: number[] = [];
      
      // 각 접근 가능한 컬렉션에 대해 하위 컬렉션 찾기
      for (const collection of accessibleCollections) {
        if (processedIds.has(collection.id)) continue;
        
        // 상위 컬렉션 ID 추가
        allIncludedIds.push(collection.id);
        processedIds.add(collection.id);
        
        console.debug(`[DEBUG] 컬렉션 ${collection.id}(${collection.name})의 하위 컬렉션 검색 중...`);
        
        // 하위 컬렉션 찾기
        const subIds = getAllSubCollectionIds(collection.id, allCollections, processedIds);
        console.debug(`[DEBUG] 컬렉션 ${collection.id}에서 발견된 하위 컬렉션 수: ${subIds.length}`);
        
        if (subIds.length > 0) {
          console.debug(`[DEBUG] 하위 컬렉션 ID: ${subIds.join(', ')}`);
          allIncludedIds = [...allIncludedIds, ...subIds];
        }
      }
      
      // 최종 컬렉션 ID 목록 설정 (중복 제거)
      collectionsToInclude = Array.from(new Set(allIncludedIds));
      
      console.debug(`[DEBUG] 총 검색할 컬렉션 수: ${collectionsToInclude.length}`);
      console.debug(`[DEBUG] 직접 접근 가능한 컬렉션 수: ${directAccessIds.length}, 포함된 하위 컬렉션 수: ${collectionsToInclude.length - directAccessIds.length}`);
      
      // 디버깅을 위한 컬렉션 정보 로깅
      if (collectionsToInclude.length > 0) {
        const collectionInfos = allCollections
          .filter(c => collectionsToInclude.includes(c.id))
          .map(c => `${c.id}:${c.name}(부모:${c.parentId || 'root'})`);
        
        console.debug(`[DEBUG] 검색할 컬렉션 정보: ${collectionInfos.join(', ')}`);
      }
    } catch (error) {
      console.error(`[ERROR] 컬렉션 검색 중 오류 발생:`, error);
    }
  }
  
  console.debug(`[DEBUG] 검색할 최종 컬렉션 ID 목록:`, collectionsToInclude);
  
  // 링크 검색 조건 구성
  const links = await prisma.link.findMany({
    take: Number(process.env.PAGINATION_TAKE_COUNT) || 50,
    skip: query.cursor ? 1 : undefined,
    cursor: query.cursor ? { id: query.cursor } : undefined,
    where: {
      AND: [
        { 
          collectionId: { 
            in: collectionsToInclude 
          } 
        },
        {
          OR: [
            ...tagCondition,
            {
              [query.searchQueryString ? "OR" : "AND"]: [
                {
                  pinnedBy: query.pinnedOnly
                    ? { some: { id: userId } }
                    : undefined,
                },
                ...searchConditions,
              ],
            },
          ],
        },
      ],
    },
    include: {
      tags: true,
      collection: {
        include: {
          parent: true
        }
      },
      pinnedBy: {
        where: { id: userId },
        select: { id: true },
      },
    },
    orderBy: order,
  });

  console.debug(`[DEBUG] 검색된 링크 수: ${links.length}`);
  
  return { response: links, status: 200 };
}


