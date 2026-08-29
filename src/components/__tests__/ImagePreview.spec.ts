import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ImagePreview from '@/components/diff/ImagePreview.vue';

const OLD = 'data:image/png;base64,AAAA';
const NEW = 'data:image/png;base64,BBBB';

describe('ImagePreview', () => {
    it('splits into base and head halves for a modified image', () => {
        const wrapper = mount(ImagePreview, { props: { oldImage: OLD, newImage: NEW } });
        const imgs = wrapper.findAll('img');

        expect(imgs).toHaveLength(2);
        expect(imgs[0]!.attributes('src')).toBe(OLD);
        expect(imgs[1]!.attributes('src')).toBe(NEW);
        expect(wrapper.find('.w-px').exists()).toBe(true); // divider between halves
        expect(wrapper.html()).not.toContain('repeating-linear-gradient'); // no hatch
    });

    it('hatches the base half for an added image', () => {
        const wrapper = mount(ImagePreview, { props: { oldImage: null, newImage: NEW } });
        const imgs = wrapper.findAll('img');

        expect(imgs).toHaveLength(1);
        expect(imgs[0]!.attributes('src')).toBe(NEW);
        expect(wrapper.find('.w-px').exists()).toBe(true); // still split
        expect(wrapper.html()).toContain('repeating-linear-gradient'); // absent side hatched
    });

    it('hatches the head half for a deleted image', () => {
        const wrapper = mount(ImagePreview, { props: { oldImage: OLD, newImage: null } });
        const imgs = wrapper.findAll('img');

        expect(imgs).toHaveLength(1);
        expect(imgs[0]!.attributes('src')).toBe(OLD);
        expect(wrapper.html()).toContain('repeating-linear-gradient');
    });
});
