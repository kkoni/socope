import { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Divider, Text } from 'react-native-paper';
import { GroupId, PostId, Post } from '../model/data';
import { getPostRepository } from '../model/repositories';
import { DateHour } from '../model/lib/date';
import { ReferenceIndex } from '../model/references/data';
import { SerializableKeyMap, SerializableValueSet } from '../model/lib/util';
import { createEmptyReferenceIndex, addReferenceIndex, getReferenceScore } from '../model/references/data';
import { getReferenceIndexRepository } from '../model/references/repositories';
import PostView from './PostView';

type Props = {
  groupId: GroupId;
}

interface ReferenceIndexWithScore {
  index: ReferenceIndex;
  score: number;
}

export default function GroupRanking(props: Props) {
  const [ referenceIndices, setReferenceIndices ] = useState<ReferenceIndexWithScore[]>([]);
  const [ loadedPosts, setLoadedPosts ] = useState<SerializableKeyMap<PostId, Post>>(new SerializableKeyMap<PostId, Post>());

  async function loadReferenceIndices() {
    const referenceIndexRepository = await getReferenceIndexRepository();
    const now = DateHour.of(new Date());
    const datesToLoad = [ now.date, now.date.prev() ];
    if (now.hour < 6) {
      datesToLoad.push(now.date.prev().prev());
    }
    const sumIndices = new SerializableKeyMap<PostId, ReferenceIndex>();
    for (const date of datesToLoad) {
      const referenceIndicesInDate = await referenceIndexRepository.get(props.groupId, date);
      for (const index of referenceIndicesInDate) {
        const sumIndex = sumIndices.get(index.postId) ?? createEmptyReferenceIndex(index.postId);
        addReferenceIndex(sumIndex, index);
        sumIndices.set(index.postId, sumIndex);
      }
    }
    const filteredIndices = Array.from(sumIndices.values()).map(index => {
      return {
        index: index,
        score: getReferenceScore(index),
      }
    }).sort((a, b) => b.score - a.score).slice(0, 20);
    setReferenceIndices(filteredIndices);
    loadPosts(filteredIndices.map(referenceIndex => referenceIndex.index.postId));
  }

  async function loadPosts(postIds: PostId[]) {
    const notLoadedPostIds: PostId[] = [];
    for (const postId of postIds) {
      if (!loadedPosts.has(postId)) {
        notLoadedPostIds.push(postId);
      }
    }
    const referredPostIdSet = new SerializableValueSet<PostId>();
    for (const [postId, post] of (await getPostRepository().get(notLoadedPostIds)).entries()) {
      loadedPosts.set(postId, post);
      if (post.embeddedPostId !== undefined) {
        referredPostIdSet.add(post.embeddedPostId);
      }
      if (post.reply !== undefined) {
        referredPostIdSet.add(post.reply.parentPostId);
        referredPostIdSet.add(post.reply.rootPostId);
      }
    }
    const notLoadedReferredPostIds = Array.from(referredPostIdSet.values()).filter(postId => !loadedPosts.has(postId));
    if (notLoadedReferredPostIds.length > 0) {
      for (const [postId, post] of (await getPostRepository().get(notLoadedReferredPostIds)).entries()) {
        loadedPosts.set(postId, post);
      }
    }

    setLoadedPosts(loadedPosts.clone());
  }

  useEffect(() => {(async () => {
    await loadReferenceIndices();
    const intervalId = setInterval(async () => {
      await loadReferenceIndices();
    }, 60000);
    return () => clearInterval(intervalId);
  })()}, [ props.groupId ]);

  const postViews = referenceIndices.map(referenceIndex => {
    const postId = referenceIndex.index.postId;
    const post = loadedPosts.get(postId);
    if (post === undefined) {
      return undefined;
    }
    const embeddedPost = post.embeddedPostId ? loadedPosts.get(post.embeddedPostId) : undefined;
    const parentPost = post.reply?.parentPostId ? loadedPosts.get(post.reply.parentPostId) : undefined;
    const rootPost = post.reply?.rootPostId ? loadedPosts.get(post.reply.rootPostId) : undefined;
    return (
      <View key={postId.toString()}>
        <View><Text>{referenceIndex.score}</Text></View>
        <PostView postedBy={post.authorId} postedAt={post.createdAt} post={post} embeddedPost={embeddedPost} parentPost={parentPost} rootPost={rootPost}/>
        <Divider style={styles.divider}/>
      </View>
    );
  }).filter(postView => postView !== undefined);

  return (
    <ScrollView>
      <View>
        {postViews}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  divider: { marginVertical: 5 },
});
