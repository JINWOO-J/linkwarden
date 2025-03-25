import {
  CollectionIncludingMembersAndLinkCount,
  LinkIncludingShortenedCollectionAndTags,
  Sort,
  CollectionSort,
} from "@/types/global";
import { useEffect } from "react";

interface Props<T> {
  sortBy: Sort | CollectionSort;
  data: T[];
  setData: (data: T[]) => void;
}

export default function useSort<
  T extends
    | CollectionIncludingMembersAndLinkCount
    | LinkIncludingShortenedCollectionAndTags,
>({ sortBy, data, setData }: Props<T>) {
  useEffect(() => {
    const dataArray = [...data];

    if (sortBy === Sort.NameAZ || sortBy === CollectionSort.NameAZ)
      setData(dataArray.sort((a, b) => a.name.localeCompare(b.name)));
    else if (sortBy === Sort.DescriptionAZ)
      setData(
        dataArray.sort((a, b) => a.description.localeCompare(b.description))
      );
    else if (sortBy === Sort.NameZA || sortBy === CollectionSort.NameZA)
      setData(dataArray.sort((a, b) => b.name.localeCompare(a.name)));
    else if (sortBy === Sort.DescriptionZA)
      setData(
        dataArray.sort((a, b) => b.description.localeCompare(a.description))
      );
    else if (sortBy === Sort.DateNewestFirst || sortBy === CollectionSort.DateNewestFirst)
      setData(
        dataArray.sort(
          (a, b) =>
            new Date(b.createdAt as string).getTime() -
            new Date(a.createdAt as string).getTime()
        )
      );
    else if (sortBy === Sort.DateOldestFirst || sortBy === CollectionSort.DateOldestFirst)
      setData(
        dataArray.sort(
          (a, b) =>
            new Date(a.createdAt as string).getTime() -
            new Date(b.createdAt as string).getTime()
        )
      );
  }, [sortBy, data]);
}
