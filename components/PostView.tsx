import { useEffect, useState } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import { Avatar, Text } from 'react-native-paper';
import { Hyperlink } from 'react-native-hyperlink';
import { linkHandler } from '../model/lib/util';
import { formatTimeDiff } from '../model/lib/date';
import { commonStyles } from '../model/lib/style';
import { Actor, ActorId, Post, PostTextPart, getPostUrl } from '../model/data';
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

  const postUrl = (props.post && actor) ? getPostUrl(props.post, actor) : undefined;
  const view = (
    <View style={postViewStyles.container}>
      <IconView actor={actor}/>
      <View style={postViewStyles.mainContainer}>
        <HeaderView actorId={props.postIndex.postedBy} postedAt={props.postIndex.postedAt} actor={actor}/>
        { props.post && <View style={postViewStyles.content}><ContentView post={props.post}/></View> }
      </View>
    </View>
  );

  if (postUrl === undefined) {
    return view;
  } else {
    return (
      <Pressable onPress={() => linkHandler(postUrl)}>
        { view }
      </Pressable>
    );
  }
}

const postViewStyles = StyleSheet.create({
  container: { flexDirection: 'row' },
  iconView: { flex: 1 },
  mainContainer: { flex: 8, flexDirection: 'column', marginLeft: 5 },
  content: { marginTop: 5 },
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
      <Avatar.Image source={{uri: iconUri}} size={32}/>
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
      <Text style={headerViewStyles.actorName}>{props.actor.name}</Text>
      <Text style={headerViewStyles.actorHandle}>@{props.actor.handle}</Text>
      <Text style={headerViewStyles.timeDiff}>{timeDiff}</Text>
    </View>
  );
}

const headerViewStyles = StyleSheet.create({
  container: { flexDirection: 'row' },
  actorName: { fontWeight: 'bold' },
  actorHandle: { color: 'gray', marginLeft: 5 },
  timeDiff: { color: 'gray', marginLeft: 5 },
});

type ContentViewProps = {
  post: Post;
}

export function ContentView(props: ContentViewProps) {
  function getTextPartComponent(textPart: PostTextPart, index: number) {
    if (textPart.linkUrl !== undefined) {
      return (
        <Hyperlink
          key={'tp-' + index}
          linkText={textPart.text}
          onPress={linkHandler}
          linkStyle={commonStyles.link}
        >
          <Text>{textPart.linkUrl}</Text>
        </Hyperlink>
      );
    } else {
      return (<Text key={'tp-' + index}>{textPart.text}</Text>);
    }
  }
  const textPartComponents = props.post.text.map((textPart, index) =>
    getTextPartComponent(textPart, index)
  );

  return (
    <View style={contentViewStyles.textContainer}>
      { textPartComponents }
    </View>
  );
}

const contentViewStyles = StyleSheet.create({
  textContainer: { flexDirection: 'column' },
});
