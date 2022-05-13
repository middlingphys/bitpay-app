import {yupResolver} from '@hookform/resolvers/yup';
import {StackScreenProps} from '@react-navigation/stack';
import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Controller, useForm} from 'react-hook-form';
import {TextInput} from 'react-native';
import * as yup from 'yup';
import Button, {ButtonState} from '../../../components/button/Button';
import BoxInput from '../../../components/form/BoxInput';
import {BaseText} from '../../../components/styled/Text';
import {CardProvider} from '../../../constants/card';
import {ProviderConfig} from '../../../constants/config.card';
import {CardActions, CardEffects} from '../../../store/card';
import {StartActivateCardParams} from '../../../store/card/card.effects';
import {Card} from '../../../store/card/card.models';
import {isActivationRequired} from '../../../utils/card';
import {useAppDispatch, useAppSelector} from '../../../utils/hooks';
import {arrayToSentence} from '../../../utils/text';
import AuthFormContainer, {
  AuthActionRow,
  AuthActionsContainer,
  AuthRowContainer,
} from '../../auth/components/AuthFormContainer';
import {CardActivationStackParamList} from '../CardActivationStack';

export type ActivateScreenParamList = {
  card: Card;
};

const getDisplayFields = (card: Card) => {
  const {activation} = ProviderConfig[card.provider];
  const {fields} = activation || {};

  return fields || {};
};

const getDescription = (card: Card) => {
  // the order should match the template
  const fieldToText: Record<string, string> = {
    cardNumber: 'your card number',
    lastFourDigits: 'the last 4 digits of your card number',
    expirationDate: 'the expiration date',
    cvv: 'the cvv',
  };

  const fieldKeys = Object.keys(getDisplayFields(card));
  const textKeys = Object.keys(fieldToText);
  const orderOf = (k: string) => textKeys.indexOf(k);

  fieldKeys.sort((a, b) => {
    if (orderOf(a) > orderOf(b)) {
      return 1;
    }
    if (orderOf(a) < orderOf(b)) {
      return -1;
    }
    return 0;
  });

  const textArray = fieldKeys.map(field => fieldToText[field]);

  return `Enter ${arrayToSentence(textArray)} to activate your card.`;
};

const schemas = {
  [CardProvider.galileo]: yup.object().shape({
    cvv: yup.string().required(),
    expirationDate: yup.string().required(),
    lastFourDigits: yup.string().required(),
  }),
  [CardProvider.firstView]: yup.object().shape({
    cardNumber: yup.string().required(),
    cvv: yup.string().required(),
    expirationDate: yup.string().required(),
  }),
};

type FirstViewFormFieldValues = {
  cardNumber: string;
  cvv: string;
  expirationDate: string;
};

type GalileoFormFieldValues = {
  cvv: string;
  expirationDate: string;
  lastFourDigits: string;
};

type ActivateFormFieldValues =
  | FirstViewFormFieldValues
  | GalileoFormFieldValues;

const isFirstViewForm = (
  formData: ActivateFormFieldValues,
): formData is FirstViewFormFieldValues => {
  const requiredKeys = Object.keys(schemas[CardProvider.firstView].fields);
  const keysToCheck = Object.keys(formData);

  return requiredKeys.every(k => keysToCheck.includes(k));
};

const isGalileoForm = (
  formData: ActivateFormFieldValues,
): formData is GalileoFormFieldValues => {
  const requiredKeys = Object.keys(schemas[CardProvider.galileo].fields);
  const keysToCheck = Object.keys(formData);

  return requiredKeys.every(k => keysToCheck.includes(k));
};

const formatExpirationDateForBackend = (expirationDate: string) => {
  const numericExpirationDate = expirationDate.replace(/\D/g, '');
  const expYear = 20 + numericExpirationDate.slice(2, 4);
  const expMonth = numericExpirationDate.slice(0, 2);

  return `${expYear}${expMonth}`;
};

const ActivateScreen: React.FC<
  StackScreenProps<CardActivationStackParamList, 'Activate'>
> = ({navigation, route}) => {
  const {card} = route.params;
  const dispatch = useAppDispatch();
  const {
    handleSubmit,
    formState: {errors},
    getValues,
    setValue,
    control,
  } = useForm<ActivateFormFieldValues>({
    resolver: yupResolver(schemas[card.provider]),
  });
  const activateStatus = useAppSelector(({CARD}) => CARD.activateCardStatus);
  const [buttonState, setButtonState] = useState<ButtonState>();
  const displayFields = getDisplayFields(card);
  const description = getDescription(card);
  const lastFourRef = useRef<TextInput>(null);
  const expDateRef = useRef<TextInput>(null);
  const cvvRef = useRef<TextInput>(null);

  const init = () => {
    if (!isActivationRequired(card)) {
      navigation.replace('Complete');
    }
  };
  const initRef = useRef(init);
  initRef.current = init;

  const onSubmit = handleSubmit(formData => {
    setButtonState('loading');
    const {cvv, expirationDate} = formData;
    const payload: StartActivateCardParams = {
      cvv: cvv,
      expirationDate: formatExpirationDateForBackend(expirationDate),
    };

    if (isGalileoForm(formData)) {
      const {lastFourDigits} = formData;

      payload.lastFourDigits = lastFourDigits;
    } else if (isFirstViewForm(formData)) {
      const {cardNumber} = formData;

      payload.cardNumber = cardNumber;
      payload.lastFourDigits = cardNumber.slice(-4);
    }

    dispatch(CardEffects.startActivateCard(card.id, payload));
  });

  useLayoutEffect(() => {
    initRef.current();
  }, []);

  useEffect(() => {
    if (activateStatus === 'success') {
      setButtonState('success');
      dispatch(CardActions.updateActivateCardStatus(null));
      setTimeout(() => {
        navigation.replace('Complete');
      }, 1000);
    } else if (activateStatus === 'failed') {
      setButtonState('failed');
      setTimeout(() => {
        setButtonState(null);
      }, 1000);
    }
  }, [navigation, dispatch, activateStatus]);

  const [expDateMaxlen, setExpDateMaxLen] = useState(4);

  return (
    <AuthFormContainer>
      <AuthRowContainer>
        <BaseText>{description}</BaseText>
      </AuthRowContainer>

      {displayFields.cardNumber ? (
        <AuthRowContainer>
          <Controller
            name="cardNumber"
            control={control}
            render={({field: {value, onChange, onBlur}}) => (
              <BoxInput
                label={'Card Number'}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.cardNumber?.message}
                value={value}
                keyboardType={'number-pad'}
                returnKeyType={'next'}
                onSubmitEditing={() => {
                  const nextRef =
                    lastFourRef.current || expDateRef.current || cvvRef.current;

                  if (nextRef) {
                    nextRef.focus();
                  } else {
                    onSubmit();
                  }
                }}
                blurOnSubmit={false}
              />
            )}
          />
        </AuthRowContainer>
      ) : null}

      {displayFields.lastFourDigits ? (
        <AuthRowContainer>
          <Controller
            name="lastFourDigits"
            control={control}
            render={({field: {value, onChange, onBlur}}) => {
              return (
                <BoxInput
                  label={'Last 4 Digits'}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.lastFourDigits?.message}
                  value={value}
                  keyboardType={'number-pad'}
                  maxLength={4}
                  ref={lastFourRef}
                  returnKeyType={'next'}
                  onSubmitEditing={() => {
                    const nextRef = expDateRef.current || cvvRef.current;

                    if (nextRef) {
                      nextRef.focus();
                    } else {
                      onSubmit();
                    }
                  }}
                  blurOnSubmit={false}
                />
              );
            }}
          />
        </AuthRowContainer>
      ) : null}

      {displayFields.expirationDate ? (
        <AuthRowContainer>
          <Controller
            name="expirationDate"
            control={control}
            render={({field: {value, onChange, onBlur}}) => {
              const _onBlur = () => {
                const formValues = getValues();
                const valueNumericOnly =
                  formValues.expirationDate?.replace(/\D/g, '') || '';
                let formattedExpDate = formValues.expirationDate || '';

                if (valueNumericOnly && valueNumericOnly.length >= 2) {
                  formattedExpDate = `${valueNumericOnly.slice(
                    0,
                    2,
                  )}/${valueNumericOnly.slice(2, 4)}`;
                }

                setExpDateMaxLen(formattedExpDate.length > 4 ? 5 : 4);
                setValue('expirationDate', formattedExpDate);

                onBlur();
              };

              return (
                <BoxInput
                  label={'Expiration Date (MM/YY)'}
                  onBlur={_onBlur}
                  onChangeText={onChange}
                  error={errors.expirationDate?.message}
                  value={value}
                  keyboardType={'number-pad'}
                  maxLength={expDateMaxlen}
                  ref={expDateRef}
                  returnKeyType={'next'}
                  onSubmitEditing={() => {
                    if (cvvRef.current) {
                      cvvRef.current.focus();
                    } else {
                      onSubmit();
                    }
                  }}
                  blurOnSubmit={false}
                />
              );
            }}
          />
        </AuthRowContainer>
      ) : null}

      {displayFields.cvv ? (
        <AuthRowContainer>
          <Controller
            name="cvv"
            control={control}
            render={({field: {value, onChange, onBlur}}) => (
              <BoxInput
                label={'CVV'}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.cvv?.message}
                value={value}
                maxLength={3}
                ref={cvvRef}
                keyboardType={'number-pad'}
                returnKeyType={'next'}
                onSubmitEditing={onSubmit}
              />
            )}
          />
        </AuthRowContainer>
      ) : null}

      <AuthActionsContainer>
        <AuthActionRow>
          <Button onPress={onSubmit} state={buttonState}>
            Activate Card
          </Button>
        </AuthActionRow>
      </AuthActionsContainer>
    </AuthFormContainer>
  );
};

export default ActivateScreen;
