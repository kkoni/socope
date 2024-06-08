import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Text } from 'react-native-paper';
import { formatTimeDiff } from '../model/lib/date';
import { Actor, ActorId, Post, PostTextPart } from '../model/data';
import { getActorRepository } from '../model/repositories';
import { PostIndex } from '../model/posts/data';

type Props = {
  postIndex: PostIndex;
  post?: Post;
};

export default function PostView(props: Props) {
  const [ actor, setActor ] = useState<Actor|undefined>(undefined);

  useEffect(() => {(async () => {
    const actor = await getActorRepository().get(props.postIndex.postedBy);
    if (actor !== undefined) {
      setActor(actor);
    }
  })()}, [props]);

  return (
    <View style={postViewStyles.container}>
      <IconView actor={actor}/>
      <View style={postViewStyles.mainContainer}>
        <HeaderView actorId={props.postIndex.postedBy} postedAt={props.postIndex.postedAt} actor={actor}/>
        { props.post && <ContentView post={props.post}/> }
      </View>
    </View>
  );
}

const postViewStyles = StyleSheet.create({
  container: { flexDirection: 'row' },
  iconView: { flex: 1 },
  mainContainer: { flex: 8, flexDirection: 'column' },
});

type IconViewProps = {
  actor?: Actor;
}

export function IconView(props: IconViewProps) {
  const iconUri = props.actor?.icon;
  if (iconUri === undefined) {
    return (<View></View>);
  }
  return (
    <View>
      <Avatar.Image source={{uri: iconUri}} size={48}/>
    </View>
  );
}

type HeaderViewProps = {
  actorId: ActorId;
  postedAt: Date;
  actor?: Actor;
};

export function HeaderView(props: HeaderViewProps) {
  const timeDiff = formatTimeDiff(Date.now() - props.postedAt.getTime());

  if (props.actor === undefined) {
    return (
      <View>
        <Text>{props.actorId.toString()}</Text>
        <Text>{timeDiff}</Text>
      </View>
    );
  }
  return (
    <View style={headerViewStyles.container}>
      <Text>{props.actor.name}</Text>
      <Text>{props.actor.handle}</Text>
      <Text>{timeDiff}</Text>
    </View>
  );
}

const headerViewStyles = StyleSheet.create({
  container: { flexDirection: 'row' },
});

type ContentViewProps = {
  post: Post;
}

export function ContentView(props: ContentViewProps) {
  function getTextPartComponent(textPart: PostTextPart) {
    return (<Text>{textPart.text}</Text>);
  }

  return (
    <View style={contentViewStyles.textContainer}>
      { props.post.text.map(getTextPartComponent) }
    </View>
  );
}

const contentViewStyles = StyleSheet.create({
  textContainer: { flexDirection: 'column' },
});
