import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { icons } from '../constants';
import type { GoogleInputProps, LocationValue } from '../types/type';
import { useColors } from '../hooks/useColors';
import { searchAddresses } from '../lib/addressSearch';
import { RouteError } from '../lib/roadRouting';

// Historical component name; provider is Photon, not Google.
export default function GoogleTextInput({icon,initialLocation,containerStyle,textInputBackgroundColor,handlePress,
  onSelectionCleared,placeholder='¿A dónde vas?'}:GoogleInputProps) {
  const colors=useColors();
  const [query,setQuery]=useState(initialLocation ?? '');
  const [results,setResults]=useState<LocationValue[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{if(initialLocation) setQuery(initialLocation);},[initialLocation]);
  useEffect(()=>{
    const controller=new AbortController();
    let active=true;
    setResults([]);setLoading(false);setMessage('');
    if(query.trim().length<3 || query===initialLocation) return ()=>{active=false;controller.abort();};
    const timer=setTimeout(async()=>{
      setLoading(true);
      try {
        const values=await searchAddresses(query,controller.signal);
        if(!active) return;
        setResults(values);
        if(!values.length) setMessage('No hay un punto preciso. Añade calle, número o comercio y elige una sugerencia.');
      } catch(error) {
        if(active && !controller.signal.aborted) setMessage(error instanceof RouteError ? error.message : 'No se pudo buscar la dirección.');
      } finally {if(active) setLoading(false);}
    },800);
    return ()=>{active=false;clearTimeout(timer);controller.abort();};
  },[query,initialLocation]);
  return <View style={[styles.wrapper,{backgroundColor:textInputBackgroundColor??colors.card,borderColor:colors.border},containerStyle]}>
    <View style={styles.inputRow}>
      <Image source={icon??icons.search} style={styles.icon} resizeMode="contain"/>
      <TextInput value={query} onChangeText={text=>{
        setQuery(text);
        if(text!==initialLocation) onSelectionCleared?.();
      }} placeholder={placeholder} placeholderTextColor={colors.mutedForeground}
        style={[styles.input,{color:colors.foreground}]} accessibilityLabel={placeholder}/>
      {loading ? <ActivityIndicator size="small" color={colors.primary}/> : null}
    </View>
    {message ? <Text accessibilityLiveRegion="polite" style={{color:colors.mutedForeground,padding:12,fontSize:12}}>{message}</Text> : null}
    {results.length ? <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
      {results.map((location,index)=><Pressable key={`${location.address}-${index}`} accessibilityRole="button"
        onPress={()=>{setQuery(location.address);setResults([]);setMessage('');handlePress(location);}}
        style={[styles.result,{borderTopColor:colors.border}]}>
        <Text style={{color:colors.foreground,fontFamily:'Jakarta-Medium'}}>{location.address}</Text>
        <Text style={{color:colors.mutedForeground,fontSize:11}}>
          Punto: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)} · confirma antes de solicitar
        </Text>
      </Pressable>)}
    </ScrollView> : null}
  </View>;
}
const styles=StyleSheet.create({
  wrapper:{borderWidth:1,borderRadius:16,overflow:'hidden',zIndex:20},
  inputRow:{minHeight:56,flexDirection:'row',alignItems:'center',paddingHorizontal:16},
  icon:{width:22,height:22,marginRight:10},
  input:{flex:1,fontFamily:'Jakarta-Medium',fontSize:15},
  results:{maxHeight:220},
  result:{paddingHorizontal:16,paddingVertical:14,borderTopWidth:StyleSheet.hairlineWidth},
});
