import { Member } from "@/types/global";
import { useEffect, useState } from "react";
import { useCollections } from "./store/collections";
import { useUser } from "./store/user";

export default function useCollectivePermissions(collectionIds: number[]) {
  const { data: collections = [] } = useCollections();
  const { data: user = {} } = useUser();
  const [permissions, setPermissions] = useState<Member | true>();

  useEffect(() => {
    console.debug(`[DEBUG] useCollectivePermissions called for collectionIds:`, collectionIds, `userId: ${user.id}`);
    console.debug(`[DEBUG] Available collections:`, collections.map(c => ({ id: c.id, name: c.name, parentId: c.parentId })));
    
    // Function to check permissions for a collection
    const checkPermissions = (currentCollectionId: number): Member | true | undefined => {
      const collection = collections.find((e) => e.id === currentCollectionId);
      
      console.debug(`[DEBUG] Checking collection:`, collection ? 
        `id: ${collection.id}, name: ${collection.name}, ownerId: ${collection.ownerId}, parentId: ${collection.parentId}` : 'not found');
      
      if (!collection) {
        console.debug(`[DEBUG] Collection ${currentCollectionId} not found`);
        return undefined;
      }
      
      // Check if user is owner
      const isOwner = user.id === collection.ownerId;
      console.debug(`[DEBUG] Is user owner? ${isOwner}`);
      
      if (isOwner) return true;
      
      // Check direct member permissions
      let getPermission: Member | undefined = collection.members.find(
        (e) => e.userId === user.id && !e.inherited
      );
      
      console.debug(`[DEBUG] Direct member permission:`, getPermission ? 
        `userId: ${getPermission.userId}, canCreate: ${getPermission.canCreate}, canUpdate: ${getPermission.canUpdate}, canDelete: ${getPermission.canDelete}` : 'none');
      
      if (getPermission && (getPermission.canCreate || getPermission.canUpdate || getPermission.canDelete)) {
        console.debug(`[DEBUG] Direct permission granted for collection ${currentCollectionId}`);
        return getPermission;
      }
      
      // Check inherited member permissions
      const inheritedMember = collection.members.find(
        (e) => e.userId === user.id && e.inherited === true
      );
      
      if (inheritedMember && (inheritedMember.canCreate || inheritedMember.canUpdate || inheritedMember.canDelete)) {
        console.debug(`[DEBUG] Inherited permission found for collection ${currentCollectionId} from ${inheritedMember.inheritedFromCollectionName}`);
        return inheritedMember;
      }
      
      // If no direct permissions and collection has a parent, check parent's permissions
      if (collection.parentId) {
        console.debug(`[DEBUG] Checking parent collection ${collection.parentId} for permissions`);
        return checkPermissions(collection.parentId);
      }
      
      console.debug(`[DEBUG] No permissions found for collection ${currentCollectionId}`);
      return undefined;
    };
    
    // Check permissions for all collection IDs
    for (const collectionId of collectionIds) {
      console.debug(`[DEBUG] Checking permissions for collection ${collectionId}`);
      const result = checkPermissions(collectionId);
      
      if (result) {
        console.debug(`[DEBUG] Found permission for collection ${collectionId}:`, 
          result === true ? 'isOwner' : `member with permissions`);
        setPermissions(result);
        break;
      }
    }
    
    console.debug(`[DEBUG] Final collective permissions:`, permissions ? 
      (permissions === true ? 'isOwner' : `member with permissions`) : 'no permissions');
  }, [user, collections, collectionIds]);

  return permissions;
}
