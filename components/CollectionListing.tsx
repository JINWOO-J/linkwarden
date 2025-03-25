import React, { useEffect, useMemo, useState } from "react";
import Tree, {
  mutateTree,
  moveItemOnTree,
  RenderItemParams,
  TreeItem,
  TreeData,
  ItemId,
  TreeSourcePosition,
  TreeDestinationPosition,
} from "@atlaskit/tree";
import { Collection } from "@prisma/client";
import Link from "next/link";
import { CollectionIncludingMembersAndLinkCount } from "@/types/global";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { useTranslation } from "next-i18next";
import { useCollections, useUpdateCollection } from "@/hooks/store/collections";
import { useUpdateUser, useUser } from "@/hooks/store/user";
import Icon from "./Icon";
import { IconWeight } from "@phosphor-icons/react";

// 트리 정렬 방식 정의
enum TreeSortMode {
  NameAZ = "NameAZ",
  NameZA = "NameZA",
  DateNewest = "DateNewest",
  DateOldest = "DateOldest",
  Default = "Default"
}

interface ExtendedTreeItem extends TreeItem {
  data: Collection;
}

const CollectionListing = () => {
  const { t } = useTranslation();
  const updateCollection = useUpdateCollection();
  const { data: collections = [], isLoading } = useCollections();

  const { data: user = {}, refetch } = useUser();
  const updateUser = useUpdateUser();

  const router = useRouter();
  const currentPath = router.asPath;

  const [tree, setTree] = useState<TreeData | undefined>();
  // 트리 정렬 방식 상태
  const [sortMode, setSortMode] = useState<TreeSortMode>(
    (localStorage.getItem("treeSortMode") as TreeSortMode) || TreeSortMode.Default
  );

  // 정렬 모드 변경 핸들러
  const handleSortModeChange = (mode: TreeSortMode) => {
    console.debug(`[DEBUG] 정렬 모드 변경: ${sortMode} -> ${mode}`);
    setSortMode(mode);
    localStorage.setItem("treeSortMode", mode);
    
    // 트리 업데이트 강제 트리거
    setTree(buildTreeFromCollections(
      collections,
      router,
      tree,
      user.collectionOrder,
      mode
    ));
  };

  const initialTree = useMemo(() => {
    if (collections.length > 0) {
      console.debug(`[DEBUG] initialTree 생성 - 정렬 모드: ${sortMode}`);
      return buildTreeFromCollections(
        collections,
        router,
        tree,
        user.collectionOrder,
        sortMode
      );
    } else return undefined;
  }, [collections, user, router, sortMode]);

  useEffect(() => {
    console.debug(`[DEBUG] 트리 설정 - 정렬 모드: ${sortMode}`);
    setTree(initialTree);
  }, [initialTree]);

  // 정렬 모드 변경 감지
  useEffect(() => {
    console.debug(`[DEBUG] sortMode 변경됨: ${sortMode}`);
    
    // 컬렉션이 있을 때만 트리 재구성
    if (collections.length > 0) {
      const newTree = buildTreeFromCollections(
        collections,
        router,
        tree,
        user.collectionOrder,
        sortMode
      );
      console.debug(`[DEBUG] sortMode 변경으로 인한 트리 재구성 완료`);
      setTree(newTree);
    }
  }, [sortMode]);

  useEffect(() => {
    if (user.username) {
      refetch();
      if (
        (!user.collectionOrder || user.collectionOrder.length === 0) &&
        collections.length > 0
      )
        updateUser.mutate({
          ...user,
          collectionOrder: collections
            .filter((e) => e.parentId === null)
            .map((e) => e.id as number),
        });
      else {
        const newCollectionOrder: number[] = [...(user.collectionOrder || [])];

        // Start with collections that are in both account.collectionOrder and collections
        const existingCollectionIds = collections.map((c) => c.id as number);
        const filteredCollectionOrder = user.collectionOrder.filter((id: any) =>
          existingCollectionIds.includes(id)
        );

        // Add new collections that are not in account.collectionOrder and meet the specific conditions
        collections.forEach((collection) => {
          if (
            !filteredCollectionOrder.includes(collection.id as number) &&
            (!collection.parentId || collection.ownerId === user.id)
          ) {
            filteredCollectionOrder.push(collection.id as number);
          }
        });

        // check if the newCollectionOrder is the same as the old one
        if (
          JSON.stringify(newCollectionOrder) !==
          JSON.stringify(user.collectionOrder)
        ) {
          updateUser.mutateAsync({
            ...user,
            collectionOrder: newCollectionOrder,
          });
        }
      }
    }
  }, [user, collections]);

  const onExpand = (movedCollectionId: ItemId) => {
    setTree((currentTree) =>
      mutateTree(currentTree!, movedCollectionId, { isExpanded: true })
    );
  };

  const onCollapse = (movedCollectionId: ItemId) => {
    setTree((currentTree) =>
      mutateTree(currentTree as TreeData, movedCollectionId, {
        isExpanded: false,
      })
    );
  };

  const onDragEnd = async (
    source: TreeSourcePosition,
    destination: TreeDestinationPosition | undefined
  ) => {
    if (!destination || !tree) {
      return;
    }

    if (
      source.index === destination.index &&
      source.parentId === destination.parentId
    ) {
      return;
    }

    const movedCollectionId = Number(
      tree.items[source.parentId].children[source.index]
    );

    const movedCollection = collections.find((c) => c.id === movedCollectionId);

    const destinationCollection = collections.find(
      (c) => c.id === Number(destination.parentId)
    );

    console.debug(`[DEBUG] 컬렉션 이동: ${movedCollectionId} -> ${destination.parentId}`);
    console.debug(`[DEBUG] 이동할 컬렉션:`, movedCollection ? 
      `id: ${movedCollection.id}, name: ${movedCollection.name}, ownerId: ${movedCollection.ownerId}` : 'Not found');
    console.debug(`[DEBUG] 대상 컬렉션:`, destinationCollection ? 
      `id: ${destinationCollection.id}, name: ${destinationCollection.name}, ownerId: ${destinationCollection.ownerId}` : 'Root');
    
    const userIsMovedCollectionOwner = movedCollection?.ownerId === user.id;
    
    console.debug(`[DEBUG] 이동할 컬렉션 소유자 체크: ${userIsMovedCollectionOwner} (소유자ID: ${movedCollection?.ownerId}, 현재사용자ID: ${user.id})`);
    
    // 컬렉션에 대한 수정 권한 확인 (소유자 또는 멤버 중 canUpdate 권한이 있는 경우)
    let userCanModifyCollection = userIsMovedCollectionOwner || 
      movedCollection?.members?.some(m => 
        m.userId === user.id && 
        (m.canUpdate || m.canDelete)
      );
    
    // 상속된 멤버인 경우 권한 확인
    if (!userCanModifyCollection && movedCollection?.members) {
      const inheritedMember = movedCollection.members.find(m => 
        m.userId === user.id && 
        m.inherited === true && 
        (m.canUpdate || m.canDelete)
      );
      
      if (inheritedMember) {
        console.debug(`[DEBUG] 상속된 이동 권한 발견: ${inheritedMember.inheritedFromCollectionName}으로부터 상속됨. canUpdate: ${inheritedMember.canUpdate}, canDelete: ${inheritedMember.canDelete}`);
        userCanModifyCollection = true;
      }
    }
    
    console.debug(`[DEBUG] 이동 권한 확인: 소유자? ${userIsMovedCollectionOwner}, 수정 권한? ${userCanModifyCollection}`);
    
    // 자신이 소유하거나 수정 권한이 있는 컬렉션만 이동 가능
    if (!userCanModifyCollection) {
      console.debug(`[DEBUG] 이동 실패: 해당 컬렉션에 대한 수정 권한이 없습니다.`);
      toast.error(t("cant_change_collection_you_dont_own"));
      return;
    }
    
    // 대상이 루트가 아닌 경우, 대상 컬렉션에 대한 생성 권한 확인
    let userCanCreateInDestination = 
      destination.parentId === "root" || 
      destinationCollection?.ownerId === user.id || 
      destinationCollection?.members?.some(m => 
        m.userId === user.id && 
        (m.canCreate || m.canUpdate || m.canDelete)
      );
    
    console.debug(`[DEBUG] 권한 확인: 소유자? ${userIsMovedCollectionOwner}, 대상에 생성 권한? ${userCanCreateInDestination}`);
    
    // 상속된 멤버 권한 체크를 추가적으로 확인
    if (destinationCollection && !userCanCreateInDestination) {
      // 상속된 멤버인지 확인
      const inheritedMember = destinationCollection.members?.find(m => 
        m.userId === user.id && 
        m.inherited === true && 
        (m.canCreate || m.canUpdate || m.canDelete)
      );
      
      if (inheritedMember) {
        console.debug(`[DEBUG] 상속된 권한 발견: ${inheritedMember.inheritedFromCollectionName}으로부터 상속됨. canCreate: ${inheritedMember.canCreate}, canUpdate: ${inheritedMember.canUpdate}, canDelete: ${inheritedMember.canDelete}`);
        userCanCreateInDestination = true;
      }
    }

    // 대상 컬렉션의 소유자가 아니고 생성 권한도 없는 경우 이동 불가
    if (destination.parentId !== "root" && !userCanCreateInDestination) {
      console.debug(`[DEBUG] 이동 실패: 대상 컬렉션에 생성 권한이 없습니다.`);
      toast.error(t("no_create_permission_in_destination"));
      return;
    }

    // 트리 업데이트
    setTree((currentTree) => moveItemOnTree(currentTree!, source, destination));

    // 컬렉션 순서 업데이트
    const updatedCollectionOrder = [...(user.collectionOrder || [])];
    console.debug(`[DEBUG] 현재 컬렉션 순서:`, updatedCollectionOrder);

    if (source.parentId !== destination.parentId) {
      console.debug(`[DEBUG] 컬렉션 부모 변경: ${source.parentId} -> ${destination.parentId}`);
      // 컬렉션의 부모가 변경된 경우 API 호출
      await updateCollection.mutateAsync(
        {
          ...movedCollection,
          parentId:
            destination.parentId && destination.parentId !== "root"
              ? Number(destination.parentId)
              : null,
        },
        {
          onSuccess: () => {
            console.debug(`[DEBUG] 컬렉션 부모 변경 성공`);
          },
          onError: (error) => {
            console.error(`[DEBUG] 컬렉션 부모 변경 실패:`, error);
            toast.error(error.message);
          },
        }
      );
    }

    // 루트 레벨에서의 순서 변경 처리
    if (destination.parentId === "root") {
      // 이미 루트에 있던 항목을 이동하는 경우
      if (source.parentId === "root") {
        console.debug(`[DEBUG] 루트 내에서 순서 변경: ${source.index} -> ${destination.index}`);
        
        // 기존 위치에서 제거
        if (updatedCollectionOrder.includes(movedCollectionId)) {
          updatedCollectionOrder.splice(updatedCollectionOrder.indexOf(movedCollectionId), 1);
        }
        
        // 새 위치에 추가
        if (destination.index !== undefined) {
          updatedCollectionOrder.splice(destination.index, 0, movedCollectionId);
        } else {
          updatedCollectionOrder.push(movedCollectionId);
        }
      } 
      // 다른 컬렉션에서 루트로 이동하는 경우
      else {
        console.debug(`[DEBUG] 다른 컬렉션에서 루트로 이동: 위치 ${destination.index}`);
        
        // 이미 리스트에 있으면 제거
        if (updatedCollectionOrder.includes(movedCollectionId)) {
          updatedCollectionOrder.splice(updatedCollectionOrder.indexOf(movedCollectionId), 1);
        }
        
        // 새 위치에 추가
        if (destination.index !== undefined) {
          updatedCollectionOrder.splice(destination.index, 0, movedCollectionId);
        } else {
          updatedCollectionOrder.push(movedCollectionId);
        }
      }
      
      console.debug(`[DEBUG] 업데이트된 컬렉션 순서:`, updatedCollectionOrder);
      
      // 사용자 컬렉션 순서 업데이트
      await updateUser.mutateAsync({
        ...user,
        collectionOrder: updatedCollectionOrder,
      }, {
        onSuccess: () => {
          console.debug(`[DEBUG] 사용자 컬렉션 순서 업데이트 성공`);
        },
        onError: (error) => {
          console.error(`[DEBUG] 사용자 컬렉션 순서 업데이트 실패:`, error);
        },
      });
    } 
    // 루트에서 다른 컬렉션으로 이동하는 경우, 루트 컬렉션 목록에서 제거
    else if (source.parentId === "root") {
      console.debug(`[DEBUG] 루트에서 다른 컬렉션으로 이동`);
      
      // 순서 목록에서 해당 컬렉션 제거
      if (updatedCollectionOrder.includes(movedCollectionId)) {
        updatedCollectionOrder.splice(updatedCollectionOrder.indexOf(movedCollectionId), 1);
      }
      
      console.debug(`[DEBUG] 업데이트된 컬렉션 순서:`, updatedCollectionOrder);
      
      // 사용자 컬렉션 순서 업데이트
      await updateUser.mutateAsync({
        ...user,
        collectionOrder: updatedCollectionOrder,
      }, {
        onSuccess: () => {
          console.debug(`[DEBUG] 사용자 컬렉션 순서 업데이트 성공`);
        },
        onError: (error) => {
          console.error(`[DEBUG] 사용자 컬렉션 순서 업데이트 실패:`, error);
        },
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-4 w-full"></div>
        <div className="skeleton h-4 w-full"></div>
        <div className="skeleton h-4 w-full"></div>
      </div>
    );
  } else if (!tree) {
    return (
      <p className="text-neutral text-xs font-semibold truncate w-full px-2 mt-5 mb-8">
        {t("you_have_no_collections")}
      </p>
    );
  } else
    return (
      <div>
        <div className="flex justify-end mb-2">
          <div className="dropdown dropdown-end">
            <div 
              tabIndex={0} 
              role="button" 
              className="btn btn-ghost btn-xs"
              onClick={() => console.debug("[DEBUG] 정렬 드롭다운 버튼 클릭")}
            >
              <i className="bi-sort-alpha-down mr-1"></i>
              {t("sort")}
            </div>
            <ul tabIndex={0} className="dropdown-content z-[30] menu p-2 shadow bg-base-200 border border-neutral-content rounded-box w-52">
              <li>
                <button 
                  className={sortMode === TreeSortMode.Default ? "active" : ""}
                  onClick={() => {
                    console.debug("[DEBUG] Default 정렬 선택");
                    handleSortModeChange(TreeSortMode.Default);
                  }}
                >
                  {t("default_order")}
                </button>
              </li>
              <li>
                <button 
                  className={sortMode === TreeSortMode.NameAZ ? "active" : ""}
                  onClick={() => {
                    console.debug("[DEBUG] NameAZ 정렬 선택");
                    handleSortModeChange(TreeSortMode.NameAZ);
                  }}
                >
                  {t("name_a_z")}
                </button>
              </li>
              <li>
                <button 
                  className={sortMode === TreeSortMode.NameZA ? "active" : ""}
                  onClick={() => {
                    console.debug("[DEBUG] NameZA 정렬 선택");
                    handleSortModeChange(TreeSortMode.NameZA);
                  }}
                >
                  {t("name_z_a")}
                </button>
              </li>
              <li>
                <button 
                  className={sortMode === TreeSortMode.DateNewest ? "active" : ""}
                  onClick={() => {
                    console.debug("[DEBUG] DateNewest 정렬 선택");
                    handleSortModeChange(TreeSortMode.DateNewest);
                  }}
                >
                  {t("newest_first")}
                </button>
              </li>
              <li>
                <button 
                  className={sortMode === TreeSortMode.DateOldest ? "active" : ""}
                  onClick={() => {
                    console.debug("[DEBUG] DateOldest 정렬 선택");
                    handleSortModeChange(TreeSortMode.DateOldest);
                  }}
                >
                  {t("oldest_first")}
                </button>
              </li>
            </ul>
          </div>
        </div>
        <Tree
          tree={tree}
          renderItem={(itemProps) => renderItem({ ...itemProps }, currentPath)}
          onExpand={onExpand}
          onCollapse={onCollapse}
          onDragEnd={onDragEnd}
          isDragEnabled
          isNestingEnabled
        />
      </div>
    );
};

export default CollectionListing;

const renderItem = (
  { item, onExpand, onCollapse, provided }: RenderItemParams,
  currentPath: string
) => {
  const collection = item.data;

  return (
    <div ref={provided.innerRef} {...provided.draggableProps} className="mb-1">
      <div
        className={`${
          currentPath === `/collections/${collection.id}`
            ? "bg-primary/20 is-active"
            : "hover:bg-neutral/20"
        } duration-100 flex gap-1 items-center pr-2 pl-1 rounded-md`}
      >
        {Dropdown(item as ExtendedTreeItem, onExpand, onCollapse)}

        <Link
          href={`/collections/${collection.id}`}
          className="w-full"
          {...provided.dragHandleProps}
        >
          <div
            className={`py-1 cursor-pointer flex items-center gap-2 w-full rounded-md h-8`}
          >
            {collection.icon ? (
              <Icon
                icon={collection.icon}
                size={30}
                weight={(collection.iconWeight || "regular") as IconWeight}
                color={collection.color}
                className="-mr-[0.15rem]"
              />
            ) : (
              <i
                className="bi-folder-fill text-2xl"
                style={{ color: collection.color }}
              ></i>
            )}

            <p className="truncate w-full">{collection.name}</p>

            {collection.isPublic && (
              <i
                className="bi-globe2 text-sm text-black/50 dark:text-white/50 drop-shadow"
                title="This collection is being shared publicly."
              ></i>
            )}
            <div className="drop-shadow text-neutral text-xs">
              {collection._count?.links}
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
};

const Dropdown = (
  item: ExtendedTreeItem,
  onExpand: (id: ItemId) => void,
  onCollapse: (id: ItemId) => void
) => {
  if (item.children && item.children.length > 0) {
    return item.isExpanded ? (
      <button onClick={() => onCollapse(item.id)}>
        <div className="bi-caret-down-fill opacity-50 hover:opacity-100 duration-200"></div>
      </button>
    ) : (
      <button onClick={() => onExpand(item.id)}>
        <div className="bi-caret-right-fill opacity-40 hover:opacity-100 duration-200"></div>
      </button>
    );
  }
  // return <span>&bull;</span>;
  return <div></div>;
};

const buildTreeFromCollections = (
  collections: CollectionIncludingMembersAndLinkCount[],
  router: ReturnType<typeof useRouter>,
  tree?: TreeData,
  order?: number[],
  sortMode: TreeSortMode = TreeSortMode.Default
): TreeData => {
  // 중복된 컬렉션 제거 (동일한 ID를 가진 컬렉션이 여러 개 있으면 하나만 유지)
  const uniqueCollections = collections.reduce<CollectionIncludingMembersAndLinkCount[]>((acc, cur) => {
    if (!acc.some(c => c.id === cur.id)) {
      acc.push(cur);
    } else {
      console.debug(`[DEBUG] 중복 컬렉션 ID 감지: ${cur.id} (${cur.name})`);
    }
    return acc;
  }, []);
  
  console.debug(`[DEBUG] Original collections: ${collections.length}, Unique collections: ${uniqueCollections.length}`);
  console.debug(`[DEBUG] 현재 정렬 모드: ${sortMode}`);
  
  // 디버그: 각 컬렉션의 멤버 및 상속된 멤버 확인
  uniqueCollections.forEach(collection => {
    const directMembers = collection.members.filter(m => !m.inherited);
    const inheritedMembers = collection.members.filter(m => m.inherited);
    
    console.debug(`[DEBUG] 컬렉션 ID ${collection.id} (${collection.name}): 직접 멤버 ${directMembers.length}명, 상속된 멤버 ${inheritedMembers.length}명`);
    
    if (inheritedMembers.length > 0) {
      console.debug(`[DEBUG] 컬렉션 ID ${collection.id}의 상속된 멤버:`, 
        inheritedMembers.map(m => ({
          userId: m.userId, 
          username: m.user.username,
          canCreate: m.canCreate,
          canUpdate: m.canUpdate,
          canDelete: m.canDelete,
          from: m.inheritedFromCollectionName
        }))
      );
    }
  });

  // 전체 컬렉션을 부모 ID 기준으로 그룹화
  const collectionsByParent: { [key: string]: CollectionIncludingMembersAndLinkCount[] } = {};
  
  uniqueCollections.forEach(collection => {
    const parentKey = collection.parentId === null ? 'root' : String(collection.parentId);
    if (!collectionsByParent[parentKey]) {
      collectionsByParent[parentKey] = [];
    }
    collectionsByParent[parentKey].push(collection);
  });
  
  // 각 그룹 내에서 정렬 적용
  Object.keys(collectionsByParent).forEach(parentKey => {
    const groupCollections = collectionsByParent[parentKey];
    
    // 정렬 모드에 따라 컬렉션 그룹 정렬
    if (sortMode === TreeSortMode.NameAZ) {
      groupCollections.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === TreeSortMode.NameZA) {
      groupCollections.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortMode === TreeSortMode.DateNewest) {
      groupCollections.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    } else if (sortMode === TreeSortMode.DateOldest) {
      groupCollections.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateA - dateB;
      });
    } else if (parentKey === 'root' && order && sortMode === TreeSortMode.Default) {
      // 루트 컬렉션만 사용자 지정 순서 적용
      groupCollections.sort((a: any, b: any) => {
        const indexA = order.indexOf(a.id);
        const indexB = order.indexOf(b.id);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      });
    }
    
    // 정렬된 결과를 다시 할당
    collectionsByParent[parentKey] = groupCollections;
  });
  
  // 정렬된 모든 컬렉션을 다시 하나의 배열로 병합
  let sortedCollections: CollectionIncludingMembersAndLinkCount[] = [];
  Object.values(collectionsByParent).forEach(group => {
    sortedCollections = [...sortedCollections, ...group];
  });

  function getTotalLinkCount(collectionId: number): number {
    const collection = items[collectionId];
    if (!collection) {
      return 0;
    }

    let totalLinkCount = (collection.data as any)._count?.links || 0;

    if (collection.hasChildren) {
      collection.children.forEach((childId) => {
        totalLinkCount += getTotalLinkCount(childId as number);
      });
    }

    return totalLinkCount;
  }

  const items: { [key: string]: ExtendedTreeItem } = sortedCollections.reduce(
    (acc: any, collection) => {
      acc[collection.id as number] = {
        id: collection.id,
        children: [],
        hasChildren: false,
        isExpanded: tree?.items[collection.id as number]?.isExpanded || false,
        data: {
          id: collection.id,
          parentId: collection.parentId,
          name: collection.name,
          description: collection.description,
          color: collection.color,
          icon: collection.icon,
          iconWeight: collection.iconWeight,
          isPublic: collection.isPublic,
          ownerId: collection.ownerId,
          createdAt: collection.createdAt,
          updatedAt: collection.updatedAt,
          _count: {
            links: collection._count?.links,
          },
        },
      };
      return acc;
    },
    {}
  );

  const activeCollectionId = Number(router.asPath.split("/collections/")[1]);

  if (activeCollectionId) {
    for (const item in items) {
      const collection = items[item];
      if (Number(item) === activeCollectionId && collection.data.parentId) {
        // get all the parents of the active collection recursively until root and set isExpanded to true
        let parentId = collection.data.parentId || null;
        while (parentId && items[parentId]) {
          items[parentId].isExpanded = true;
          parentId = items[parentId].data.parentId;
        }
      }
    }
  }

  sortedCollections.forEach((collection) => {
    const parentId = collection.parentId;
    if (parentId && items[parentId] && collection.id) {
      items[parentId].children.push(collection.id);
      items[parentId].hasChildren = true;
    }
  });

  sortedCollections.forEach((collection) => {
    const collectionId = collection.id;
    if (items[collectionId as number] && collection.id) {
      const linkCount = getTotalLinkCount(collectionId as number);
      (items[collectionId as number].data as any)._count.links = linkCount;
    }
  });

  const rootId = "root";
  items[rootId] = {
    id: rootId,
    children: (sortedCollections
      .filter(
        (c) =>
          c.parentId === null || !sortedCollections.find((i) => i.id === c.parentId)
      )
      .map((c) => c.id) || "") as unknown as string[],
    hasChildren: true,
    isExpanded: true,
    data: { name: "Root" } as Collection,
  };

  return { rootId, items };
};
