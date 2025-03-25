import { prisma } from "@/lib/api/db";
import { LinkRequestQuery, Order, Sort } from "@/types/global";
import getPermission from "@/lib/api/getPermission";

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

  const collectionCondition = [];

  if (query.collectionId) {
    // 특정 컬렉션의 링크를 요청한 경우, 먼저 사용자가 이 컬렉션에 접근 권한이 있는지 확인
    const hasPermission = await getPermission({
      userId,
      collectionId: query.collectionId,
    });
    
    console.debug(`[DEBUG] 컬렉션 ${query.collectionId}에 대한 권한 확인 결과:`, hasPermission ? '접근 가능' : '접근 불가');
    
    if (hasPermission) {
      // 접근 권한이 있는 경우만 해당 컬렉션의 링크를 가져오도록 조건 추가
      collectionCondition.push({
        collection: {
          id: query.collectionId,
        },
      });
    } else {
      // 접근 권한이 없으면 빈 결과 반환
      console.debug(`[DEBUG] 컬렉션 ${query.collectionId}에 대한 접근 권한이 없어 빈 결과 반환`);
      return { response: [], status: 200 };
    }
  }

  // 컬렉션 조건 - 기존 방식과 상속된 권한을 모두 고려
  const collectionAccessCondition = query.collectionId
    ? [] // 특정 컬렉션을 명시한 경우 이미 위에서 권한 체크를 했으므로 추가 조건이 필요 없음
    : [{
        OR: [
          { ownerId: userId }, // 사용자가 소유자인 컬렉션
          {
            members: {
              some: { userId }, // 사용자가 직접 멤버인 컬렉션
            },
          },
          // 상속된 권한을 고려하기 위한 로직이 필요하지만, 
          // 현재 DB 구조에서는 직접 쿼리하기 어려움
          // 따라서 getPermission에서 처리하는 방식으로 구현
        ],
      }];

  const links = await prisma.link.findMany({
    take: Number(process.env.PAGINATION_TAKE_COUNT) || 50,
    skip: query.cursor ? 1 : undefined,
    cursor: query.cursor ? { id: query.cursor } : undefined,
    where: {
      AND: [
        {
          collection: query.collectionId 
            ? { id: query.collectionId } // 특정 컬렉션을 요청한 경우
            : {
                OR: [
                  { ownerId: userId }, // 사용자가 소유자인 컬렉션
                  {
                    members: {
                      some: { userId }, // 사용자가 직접 멤버인 컬렉션
                    },
                  },
                ],
              },
        },
        ...collectionCondition,
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
      collection: true,
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
