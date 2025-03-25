import { useEffect, useState } from "react";
import { Member } from "@/types/global";
import { useCollections } from "./store/collections";
import { useUser } from "./store/user";

export default function usePermissions(collectionId: number) {
  console.debug(`[DEBUG] usePermissions - Checking permission for collection: ${collectionId}`);
  
  const { data: collections = [] } = useCollections();
  const { data: user = {} } = useUser();
  
  const [collectionPermissions, setCollectionPermissions] = useState<
    true | Member | false
  >(false);
  
  useEffect(() => {
    // Always reset permissions when collectionId changes
    setCollectionPermissions(false);
    
    if (!collections || !collectionId) {
      console.debug(`[DEBUG] usePermissions - No collections or collectionId, returning false`);
      return;
    }
    
    const collection = collections.find((e) => e.id === collectionId);
    
    if (!collection) {
      console.debug(`[DEBUG] usePermissions - Collection not found, returning false`);
      return;
    }
    
    console.debug(`[DEBUG] usePermissions - Collection found: id: ${collectionId}, name: ${collection.name}, ownerId: ${collection.ownerId}, userId: ${user.id}`);
    console.debug(`[DEBUG] usePermissions - Collection members:`, collection.members.map(m => ({
      userId: m.userId,
      username: m.user?.username,
      canCreate: m.canCreate,
      canUpdate: m.canUpdate,
      canDelete: m.canDelete,
      inherited: m.inherited,
      from: m.inheritedFromCollectionName
    })));
    
    // If the user is the owner, they have full permissions
    if (collection.ownerId === user.id) {
      console.debug(`[DEBUG] usePermissions - User is owner, returning true`);
      setCollectionPermissions(true);
      return;
    }
    
    const collectionMembers = collection.members as Member[];
    
    if (!collectionMembers || collectionMembers.length === 0) {
      console.debug(`[DEBUG] usePermissions - No members found, returning false`);
      return;
    }
    
    // Check if the user is a direct member
    const member = collectionMembers.find((e) => e.userId === user.id && !e.inherited);
    
    if (member) {
      console.debug(`[DEBUG] usePermissions - User is a direct member, canCreate: ${member.canCreate}, canUpdate: ${member.canUpdate}, canDelete: ${member.canDelete}`);
      setCollectionPermissions(member);
      return;
    }
    
    // Check for inherited members
    const inheritedMember = collectionMembers.find(
      (e) => e.userId === user.id && e.inherited === true
    );
    
    if (inheritedMember) {
      console.debug(`[DEBUG] usePermissions - User has inherited permissions from ${inheritedMember.inheritedFromCollectionName} (ID: ${inheritedMember.inheritedFromCollectionId}), canCreate: ${inheritedMember.canCreate}, canUpdate: ${inheritedMember.canUpdate}, canDelete: ${inheritedMember.canDelete}`);
      
      // 상속된 권한을 적용하기
      setCollectionPermissions(inheritedMember);
      return;
    }
    
    console.debug(`[DEBUG] usePermissions - User has no permissions, returning false`);
    setCollectionPermissions(false);
  }, [collectionId, collections, user.id]);
  
  return collectionPermissions;
}
